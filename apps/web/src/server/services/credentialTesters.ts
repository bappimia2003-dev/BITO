import { redact } from '@bito/shared';
import type { CredentialType } from '../repositories/credentialSchemas.js';

export interface TestResult {
  ok: boolean;
  message: string;
  [key: string]: unknown;
}

export function hasCredentialTester(type: string): boolean {
  return ['telegramBot', 'geminiApiKey', 'whatsappCloud', 'metaPage', 'googleOAuth'].includes(type);
}

export async function testCredentialConnection(
  type: CredentialType,
  data: Record<string, unknown>
): Promise<TestResult> {
  const signal = AbortSignal.timeout(8000);

  try {
    switch (type) {
      case 'telegramBot': {
        const botToken = String(data.botToken || '');
        if (!botToken) return { ok: false, message: 'Missing bot token' };

        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          result?: { username?: string };
          description?: string;
        } | null;

        if (res.ok && json?.ok && json.result?.username) {
          return { ok: true, message: `Connected to Telegram as @${json.result.username}` };
        }
        const desc = json?.description ? String(redact(json.description)) : `HTTP ${res.status}`;
        return { ok: false, message: `Telegram API error: ${desc}` };
      }

      case 'geminiApiKey': {
        const apiKey = String(data.apiKey || '');
        if (!apiKey) return { ok: false, message: 'Missing Gemini API key' };

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, { signal });
        if (res.ok) {
          return { ok: true, message: 'Successfully connected to Google Gemini API' };
        }
        return { ok: false, message: `Gemini API rejected key with HTTP ${res.status}` };
      }

      case 'whatsappCloud': {
        const accessToken = String(data.accessToken || '');
        const phoneNumberId = String(data.phoneNumberId || '');
        if (!accessToken || !phoneNumberId) {
          return { ok: false, message: 'Missing access token or phone number ID' };
        }

        const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });

        if (res.ok) {
          return { ok: true, message: 'Successfully connected to WhatsApp Cloud API' };
        }
        return { ok: false, message: `WhatsApp Cloud API returned HTTP ${res.status}` };
      }

      case 'metaPage': {
        const pageAccessToken = String(data.pageAccessToken || '');
        const pageId = String(data.pageId || '');
        if (!pageAccessToken || !pageId) {
          return { ok: false, message: 'Missing page access token or page ID' };
        }

        const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}?access_token=${encodeURIComponent(pageAccessToken)}`;
        const res = await fetch(url, { signal });
        if (res.ok) {
          return { ok: true, message: 'Successfully connected to Meta Page API' };
        }
        return { ok: false, message: `Meta Page API returned HTTP ${res.status}` };
      }

      case 'googleOAuth': {
        const accessToken = String(data.accessToken || '');
        if (!accessToken) return { ok: false, message: 'Missing OAuth access token' };

        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });

        if (res.ok) {
          const info = (await res.json().catch(() => ({}))) as { email?: string };
          return {
            ok: true,
            message: `Successfully connected to Google as ${info.email || 'authenticated user'}`,
          };
        }
        return { ok: false, message: `Google OAuth verification failed with HTTP ${res.status}` };
      }

      default:
        return { ok: true, message: 'Credential format validated' };
    }
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `Connection test failed: ${String(redact(rawMsg))}`,
    };
  }
}
