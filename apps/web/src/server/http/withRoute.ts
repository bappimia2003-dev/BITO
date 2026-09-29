import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { BitoError, type ProjectRole, logger } from '@bito/shared';
import { env } from '../env.js';
import { assertRateLimit } from '../security/rateLimit.js';
import { extractSessionToken } from '../auth/cookies.js';
import { findActiveSessionByToken, type Session } from '../repositories/sessions.js';
import { findUserById, type User } from '../repositories/users.js';
import { assertRecentAuth } from '../auth/recentAuth.js';
import { assertProjectRole } from '../auth/rbac.js';

export interface RouteContext<TBody = unknown, TQuery = unknown> {
  req: Request;
  params: Record<string, string>;
  body: TBody;
  query: TQuery;
  user?: User;
  session?: Session;
  projectId?: string;
  role?: ProjectRole;
}

export interface WithRouteOptions<TBody, TQuery> {
  auth?: boolean;
  role?: ProjectRole;
  recentAuth?: boolean;
  rateLimit?: (ctx: { req: Request; params: Record<string, string> }) => {
    key: string;
    limit: number;
    windowSec?: number;
  };
  body?: z.ZodType<TBody>;
  query?: z.ZodType<TQuery>;
  skipCsrf?: boolean;
}

export function withRoute<TBody = unknown, TQuery = unknown>(
  options: WithRouteOptions<TBody, TQuery>,
  handler: (ctx: RouteContext<TBody, TQuery>) => Promise<Response | Record<string, unknown>>
) {
  return async function routeHandler(req: Request, ...args: unknown[]): Promise<Response> {
    try {
      const context = args[0] as
        { params?: Promise<Record<string, string | string[] | undefined>> } | undefined;
      const resolvedParams: Record<string, string> = {};
      if (context && typeof context === 'object' && 'params' in context && context.params) {
        const raw = await context.params;
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw)) {
            if (typeof v === 'string') {
              resolvedParams[k] = v;
            } else if (Array.isArray(v) && typeof v[0] === 'string') {
              resolvedParams[k] = v[0];
            }
          }
        }
      }

      // 1. CSRF & Origin check for mutating requests (POST, PUT, PATCH, DELETE)
      const method = req.method.toUpperCase();
      const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

      if (isMutating && !options.skipCsrf) {
        const origin = req.headers.get('origin') || req.headers.get('referer');
        if (origin) {
          try {
            const expectedOrigin = new URL(env.APP_URL).origin;
            const actualOrigin = new URL(origin).origin;
            if (expectedOrigin !== actualOrigin) {
              throw BitoError('FORBIDDEN', 'Cross-origin request rejected', { httpStatus: 403 });
            }
          } catch (urlErr) {
            if (urlErr instanceof BitoError) throw urlErr;
            throw BitoError('FORBIDDEN', 'Invalid request origin', { httpStatus: 403 });
          }
        }
      }

      // 2. Authentication & Session resolution
      let currentUser: User | undefined;
      let currentSession: Session | undefined;

      const sessionToken = extractSessionToken(req.headers);
      if (sessionToken) {
        const session = await findActiveSessionByToken(sessionToken);
        if (session) {
          const user = await findUserById(session.userId);
          if (user && !user.isDisabled) {
            currentUser = user;
            currentSession = session;
          }
        }
      }

      if (options.auth) {
        if (!currentUser || !currentSession) {
          throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
        }

        if (options.recentAuth) {
          assertRecentAuth(currentSession, 300);
        }

        if (options.role) {
          const projectId = resolvedParams.projectId ?? resolvedParams.id;
          if (projectId) {
            await assertProjectRole({ userId: currentUser.id }, projectId, options.role);
          }
        }
      }

      // 3. Rate limiting check if configured
      if (options.rateLimit) {
        const rl = options.rateLimit({ req, params: resolvedParams });
        await assertRateLimit(rl.key, rl.limit, rl.windowSec ?? 60);
      }

      // 4. Query parsing if schema provided
      let parsedQuery: TQuery = {} as TQuery;
      if (options.query) {
        const url = new URL(req.url);
        const queryObj = Object.fromEntries(url.searchParams.entries());
        parsedQuery = options.query.parse(queryObj);
      }

      // 5. Body parsing if schema provided
      let parsedBody: TBody = {} as TBody;
      if (options.body && isMutating) {
        const contentType = req.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw BitoError('VALIDATION_FAILED', 'Content-Type must be application/json', {
            httpStatus: 415,
          });
        }
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          throw BitoError('VALIDATION_FAILED', 'Malformed JSON in request body', {
            httpStatus: 400,
          });
        }
        parsedBody = options.body.parse(rawBody);
      }

      // 6. Execute handler
      const result = await handler({
        req,
        params: resolvedParams,
        body: parsedBody,
        query: parsedQuery,
        user: currentUser,
        session: currentSession,
        projectId: resolvedParams.projectId ?? resolvedParams.id,
        role: options.role,
      });

      if (result instanceof Response) {
        return result;
      }

      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof BitoError) {
        logger.warn(`API Error [${err.code}]: ${err.message}`, {
          code: err.code,
          status: err.httpStatus,
          details: err.details,
        });
        return NextResponse.json(
          {
            error: {
              code: err.code,
              message: err.message,
              ...(err.details ? { details: err.details } : {}),
            },
          },
          { status: err.httpStatus }
        );
      }

      if (err instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Invalid request data',
              details: err.format(),
            },
          },
          { status: 400 }
        );
      }

      // Never leak stack traces or raw errors to clients (SPEC Section 0.4)
      logger.error('Unhandled internal error in API route', {
        error: err instanceof Error ? err.message : String(err),
      });

      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected internal error occurred',
          },
        },
        { status: 500 }
      );
    }
  };
}
