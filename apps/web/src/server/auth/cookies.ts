import { env } from '../env.js';

export function getSessionCookieName(): string {
  const isHttps = env.APP_URL.startsWith('https://');
  return isHttps ? '__Host-bito_session' : 'bito_session';
}

export interface SessionCookieOptions {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax';
  path: string;
  secure: boolean;
  maxAge: number;
}

export function buildSessionCookie(token: string): SessionCookieOptions {
  const isHttps = env.APP_URL.startsWith('https://');
  const name = getSessionCookieName();

  return {
    name,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isHttps,
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  };
}

export function buildSessionClearCookie(): SessionCookieOptions {
  const isHttps = env.APP_URL.startsWith('https://');
  const name = getSessionCookieName();

  return {
    name,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isHttps,
    maxAge: 0,
  };
}

export function serializeCookieHeader(options: SessionCookieOptions): string {
  const parts = [
    `${options.name}=${options.value}`,
    `Path=${options.path}`,
    `SameSite=Lax`,
    'HttpOnly',
    `Max-Age=${options.maxAge}`,
  ];
  if (options.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function extractSessionToken(headers: Headers): string | null {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) return null;

  const targetName = getSessionCookieName();
  const cookies = cookieHeader.split(';').map((c) => c.trim());

  // First try the configured cookie name
  for (const c of cookies) {
    const [name, ...valParts] = c.split('=');
    if (name === targetName) {
      return valParts.join('=') || null;
    }
  }

  // Fallback to check the other name (e.g. In case tests or dev switched)
  const fallbackName = targetName === 'bito_session' ? '__Host-bito_session' : 'bito_session';
  for (const c of cookies) {
    const [name, ...valParts] = c.split('=');
    if (name === fallbackName) {
      return valParts.join('=') || null;
    }
  }

  return null;
}
