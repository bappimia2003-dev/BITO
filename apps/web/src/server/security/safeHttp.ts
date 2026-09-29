import dns from 'node:dns/promises';
import net from 'node:net';
import {
  BitoError,
  logger,
  type SafeHttp,
  type SafeHttpRequest,
  type SafeHttpResponse,
} from '@bito/shared';

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;

export function isPrivateOrBlockedIp(
  ip: string,
  allowPrivate = process.env.ALLOW_PRIVATE_HTTP === 'true'
): boolean {
  if (allowPrivate) {
    return false;
  }

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  if (ip.toLowerCase().startsWith('::ffff:')) {
    const v4 = ip.substring(7);
    if (net.isIPv4(v4)) {
      return isPrivateOrBlockedIp(v4, allowPrivate);
    }
  }

  // IPv4 Checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    const [p0, p1] = parts;
    if (p0 === undefined || p1 === undefined) return true;

    // 0.0.0.0/8 (Current network)
    if (p0 === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (p0 === 127) return true;
    // 10.0.0.0/8 (Private)
    if (p0 === 10) return true;
    // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (p0 === 192 && p1 === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
    if (p0 === 169 && p1 === 254) return true;
    // 100.64.0.0/10 (CGNAT: 100.64.0.0 - 100.127.255.255)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
    if (p0 === 192 && p1 === 0 && parts[2] === 2) return true;
    if (p0 === 198 && p1 === 51 && parts[2] === 100) return true;
    if (p0 === 203 && p1 === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (p0 >= 224) return true;

    return false;
  }

  // IPv6 Checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // ::1 (Loopback) & :: (Unspecified)
    if (normalized === '::1' || normalized === '::') return true;
    // fc00::/7 (Unique local: fc00 - fdff)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // fe80::/10 (Link-local: fe80 - febf)
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
    // ff00::/8 (Multicast)
    if (normalized.startsWith('ff')) return true;

    return false;
  }

  return true;
}

export async function validateUrlSsrf(
  rawUrl: string,
  allowPrivate = process.env.ALLOW_PRIVATE_HTTP === 'true'
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw BitoError('VALIDATION_FAILED', `Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw BitoError('SSRF_DISALLOWED_PROTOCOL', `Disallowed protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw BitoError('VALIDATION_FAILED', 'Missing URL hostname');
  }

  // If already an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname, allowPrivate)) {
      throw BitoError('SSRF_PRIVATE_IP_BLOCKED', `Requests to private IP ${hostname} are blocked`);
    }
    return parsed;
  }

  // Resolve DNS
  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch (err) {
    throw BitoError(
      'DNS_RESOLUTION_FAILED',
      `DNS resolution failed for ${hostname}: ${String(err)}`
    );
  }

  if (!records || records.length === 0) {
    throw BitoError('DNS_RESOLUTION_FAILED', `No DNS records found for ${hostname}`);
  }

  for (const record of records) {
    if (isPrivateOrBlockedIp(record.address, allowPrivate)) {
      throw BitoError(
        'SSRF_PRIVATE_IP_BLOCKED',
        `Hostname ${hostname} resolves to blocked IP ${record.address}`
      );
    }
  }

  return parsed;
}

export class SafeHttpClient implements SafeHttp {
  async fetch(req: SafeHttpRequest): Promise<SafeHttpResponse> {
    let currentUrl = req.url;
    const currentHeaders: Record<string, string> = { ...(req.headers ?? {}) };
    const method = (req.method ?? 'GET').toUpperCase();
    const timeoutMs = Math.min(Math.max(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);

    if (req.body && Buffer.byteLength(req.body) > MAX_BODY_BYTES) {
      throw BitoError('PAYLOAD_TOO_LARGE', `Request body exceeds 5 MB limit`);
    }

    let redirectCount = 0;

    while (redirectCount <= MAX_REDIRECTS) {
      const parsedUrl = await validateUrlSsrf(currentUrl);
      const startTime = Date.now();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(parsedUrl.toString(), {
          method,
          headers: currentHeaders,
          body: method !== 'GET' && method !== 'HEAD' ? req.body : undefined,
          redirect: 'manual',
          signal: controller.signal,
        });

        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        // Structured log (path without query string)
        logger.info(`HTTP ${method} ${parsedUrl.host}${parsedUrl.pathname} -> ${response.status}`, {
          kind: 'http',
          method,
          host: parsedUrl.host,
          path: parsedUrl.pathname,
          status: response.status,
          durationMs,
        });

        // Handle redirect
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            break; // No location header, treat as normal response
          }

          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            throw BitoError(
              'SSRF_REDIRECT_LIMIT_EXCEEDED',
              `Exceeded maximum redirect limit (${MAX_REDIRECTS})`
            );
          }

          const nextUrl = new URL(location, parsedUrl).toString();
          const nextParsed = new URL(nextUrl);

          // Strip sensitive auth headers on cross-origin redirects
          if (nextParsed.origin !== parsedUrl.origin) {
            delete currentHeaders['authorization'];
            delete currentHeaders['Authorization'];
            delete currentHeaders['cookie'];
            delete currentHeaders['Cookie'];
          }

          currentUrl = nextUrl;
          continue;
        }

        // Check content-length header
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
          throw BitoError(
            'OUTPUT_TOO_LARGE',
            `Response exceeds 5 MB limit (${contentLength} bytes)`
          );
        }

        const responseText = await response.text();
        if (Buffer.byteLength(responseText) > MAX_BODY_BYTES) {
          throw BitoError('OUTPUT_TOO_LARGE', `Response body exceeds 5 MB limit`);
        }

        const respHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => {
          respHeaders[key.toLowerCase()] = val;
        });

        return {
          status: response.status,
          statusText: response.statusText,
          headers: respHeaders,
          body: responseText,
          json<T = unknown>(): T {
            try {
              return JSON.parse(responseText) as T;
            } catch (err) {
              throw BitoError(
                'JSON_PARSE_ERROR',
                `Failed to parse response body as JSON: ${String(err)}`
              );
            }
          },
        };
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          throw BitoError('TIMEOUT', `Request timed out after ${timeoutMs}ms`, { retryable: true });
        }
        if (
          (err as { code?: string })?.code?.startsWith('SSRF_') ||
          (err as { code?: string })?.code === 'OUTPUT_TOO_LARGE'
        ) {
          throw err;
        }
        throw BitoError('HTTP_ERROR', `HTTP request failed: ${String(err)}`, { retryable: true });
      }
    }

    throw BitoError('SSRF_REDIRECT_LIMIT_EXCEEDED', 'Too many redirects');
  }
}

export const safeHttp = new SafeHttpClient();
