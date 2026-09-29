import crypto from 'node:crypto';
import { type Item, type Json } from '@bito/shared';
import {
  findWebhookByToken,
  recordWebhookEvent,
} from '../../../../server/repositories/webhooks.js';
import { incrementRateLimit } from '../../../../server/security/rateLimit.js';
import { startExecution } from '../../../../server/engine-runtime/startExecution.js';
import { runTick } from '../../../../server/engine-runtime/runTick.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

async function handleWebhook(
  req: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

  // 1. Rate limiting: hook:<token> 120/min and ip:<ip> 600/min -> 429 + Retry-After
  const hookRate = await incrementRateLimit(`hook:${token}`, 120, 60);
  if (!hookRate.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests on this webhook endpoint' } },
      {
        status: 429,
        headers: { 'Retry-After': String(hookRate.retryAfterSec ?? 60) },
      }
    );
  }

  const ipRate = await incrementRateLimit(`ip:${ip}`, 600, 60);
  if (!ipRate.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests from this IP address' } },
      {
        status: 429,
        headers: { 'Retry-After': String(ipRate.retryAfterSec ?? 60) },
      }
    );
  }

  // 2. Lookup endpoint by token; unknown or inactive -> 404 (same body/latency for both)
  const endpoint = await findWebhookByToken(token);
  if (
    !endpoint ||
    !endpoint.isActive ||
    endpoint.workflowStatus !== 'active' ||
    !endpoint.activeVersionId
  ) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found or inactive' } },
      { status: 404 }
    );
  }

  // 3. Method allowed check (else 405)
  const allowedMethods = ((endpoint.config['methods'] as string[]) || ['POST']).map((m) =>
    m.toUpperCase()
  );

  if (!allowedMethods.includes(req.method.toUpperCase())) {
    return Response.json(
      {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method} not allowed. Allowed: ${allowedMethods.join(', ')}`,
        },
      },
      {
        status: 405,
        headers: { Allow: allowedMethods.join(', ') },
      }
    );
  }

  // 4. Body size > 1 MB -> 413
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 1024 * 1024) {
    return Response.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeds 1MB limit' } },
      { status: 413 }
    );
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 1024 * 1024) {
    return Response.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload exceeds 1MB limit' } },
      { status: 413 }
    );
  }

  // 5. Verify provider signature
  const requireSignature = endpoint.config['requireSignature'] !== false;
  const timestampStr = req.headers.get('x-bito-timestamp');
  const signatureHeader = req.headers.get('x-bito-signature');

  if (requireSignature) {
    if (!timestampStr || !signatureHeader) {
      return Response.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing required signature headers (X-Bito-Timestamp, X-Bito-Signature)',
          },
        },
        { status: 401 }
      );
    }

    const timestamp = parseInt(timestampStr, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (isNaN(timestamp) || Math.abs(nowSec - timestamp) > 300) {
      return Response.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Signature timestamp outside replay window (300s)',
          },
        },
        { status: 401 }
      );
    }

    const expectedHex = crypto
      .createHmac('sha256', endpoint.secretPlaintext ?? '')
      .update(`${timestampStr}.${rawBody}`)
      .digest('hex');

    const receivedHex = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;

    const expectedBuf = Buffer.from(expectedHex, 'utf8');
    const receivedBuf = Buffer.from(receivedHex, 'utf8');

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      void recordAuditLog({
        userId: null,
        projectId: endpoint.projectId,
        action: 'webhook.signature_failed',
        targetType: 'webhook_endpoint',
        targetId: endpoint.id,
        ip,
        userAgent: req.headers.get('user-agent') ?? undefined,
      }).catch(() => {});

      return Response.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } },
        { status: 401 }
      );
    }
  }

  // 6. Replay & Duplicate protection via webhook_events
  const idempotencyKey = req.headers.get('idempotency-key');
  let eventKey: string;
  if (idempotencyKey) {
    eventKey = idempotencyKey;
  } else if (signatureHeader && timestampStr) {
    eventKey = crypto
      .createHash('sha256')
      .update(`${timestampStr}:${signatureHeader}`)
      .digest('hex');
  } else {
    eventKey = crypto.createHash('sha256').update(rawBody).digest('hex');
  }

  const isNew = await recordWebhookEvent(endpoint.id, eventKey);
  if (!isNew) {
    return Response.json({ ok: true, duplicate: true }, { status: 200 });
  }

  // 7. Parse JSON body
  let parsedBody: Json = {};
  if (rawBody.trim().length > 0) {
    try {
      parsedBody = JSON.parse(rawBody) as Json;
    } catch {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: 'Malformed JSON payload' } },
        { status: 400 }
      );
    }
  }

  // 8. Normalize request to items
  const headersRecord: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersRecord[key] = value;
  });

  const queryRecord: Record<string, string> = {};
  const url = new URL(req.url);
  url.searchParams.forEach((value, key) => {
    queryRecord[key] = value;
  });

  const item: Item = {
    json: {
      body: parsedBody,
      headers: headersRecord,
      query: queryRecord,
      method: req.method,
    },
  };

  // 9. Start execution for workflow active version
  const executionId = await startExecution({
    workflowId: endpoint.workflowId,
    projectId: endpoint.projectId,
    versionId: endpoint.activeVersionId,
    triggerNodeId: endpoint.nodeId,
    mode: 'trigger',
    items: [item],
  });

  // 10. Background tick & respond 200
  void runTick({ budgetMs: 5000 }).catch(() => {});

  return Response.json({ ok: true, executionId }, { status: 200 });
}

export const GET = handleWebhook;
export const POST = handleWebhook;
export const PUT = handleWebhook;
export const PATCH = handleWebhook;
export const DELETE = handleWebhook;
