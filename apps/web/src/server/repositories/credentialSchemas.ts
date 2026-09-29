import { z } from 'zod';
import { BitoError } from '@bito/shared';

export const CREDENTIAL_TYPES = [
  'telegramBot',
  'geminiApiKey',
  'whatsappCloud',
  'metaPage',
  'googleOAuth',
  'httpBearer',
  'httpBasic',
  'httpHeader',
] as const;

export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const credentialTypeSchema = z.enum(CREDENTIAL_TYPES);

export const telegramBotDataSchema = z.object({
  botToken: z.string().min(1, 'botToken is required'),
  botUsername: z.string().optional().default(''),
});

export const geminiApiKeyDataSchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
});

export const whatsappCloudDataSchema = z.object({
  accessToken: z.string().min(1, 'accessToken is required'),
  appSecret: z.string().optional().default(''),
  verifyToken: z.string().optional().default(''),
  phoneNumberId: z.string().min(1, 'phoneNumberId is required'),
});

export const metaPageDataSchema = z.object({
  pageAccessToken: z.string().min(1, 'pageAccessToken is required'),
  appSecret: z.string().optional().default(''),
  verifyToken: z.string().optional().default(''),
  pageId: z.string().min(1, 'pageId is required'),
});

export const googleOAuthDataSchema = z.object({
  refreshToken: z.string().optional().default(''),
  accessToken: z.string().min(1, 'accessToken is required'),
  email: z.string().email('Valid email is required'),
  scopes: z.array(z.string()).default([]),
});

export const httpBearerDataSchema = z.object({
  token: z.string().min(1, 'token is required'),
});

export const httpBasicDataSchema = z.object({
  username: z.string().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
});

export const httpHeaderDataSchema = z.object({
  headerName: z.string().min(1, 'headerName is required'),
  headerValue: z.string().min(1, 'headerValue is required'),
});

/**
 * Returns masked display string with bullet prefix and trailing characters.
 * Example: '••••••ab12' (SPEC Section 13.3)
 */
export function maskSecret(secret: string): string {
  if (!secret) return '••••••';
  const tail = secret.length > 4 ? secret.slice(-4) : secret;
  return `••••••${tail}`;
}

/**
 * Validates and parses the secret payload for a given credential type.
 */
export function parseCredentialData(type: CredentialType, data: unknown): Record<string, unknown> {
  switch (type) {
    case 'telegramBot':
      return telegramBotDataSchema.parse(data);
    case 'geminiApiKey':
      return geminiApiKeyDataSchema.parse(data);
    case 'whatsappCloud':
      return whatsappCloudDataSchema.parse(data);
    case 'metaPage':
      return metaPageDataSchema.parse(data);
    case 'googleOAuth':
      return googleOAuthDataSchema.parse(data);
    case 'httpBearer':
      return httpBearerDataSchema.parse(data);
    case 'httpBasic':
      return httpBasicDataSchema.parse(data);
    case 'httpHeader':
      return httpHeaderDataSchema.parse(data);
    default:
      throw BitoError('VALIDATION_FAILED', `Unsupported credential type: ${String(type)}`);
  }
}

/**
 * Computes the non-secret hint object for a given credential type.
 * Never includes raw secret values. (SPEC Section 13.1 & 13.3)
 */
export function computeCredentialHint(
  type: CredentialType,
  data: Record<string, unknown>
): Record<string, unknown> {
  switch (type) {
    case 'telegramBot': {
      const parsed = telegramBotDataSchema.parse(data);
      return {
        botUsername: parsed.botUsername,
        tokenTail: maskSecret(parsed.botToken),
      };
    }
    case 'geminiApiKey': {
      const parsed = geminiApiKeyDataSchema.parse(data);
      return {
        keyTail: maskSecret(parsed.apiKey),
      };
    }
    case 'whatsappCloud': {
      const parsed = whatsappCloudDataSchema.parse(data);
      return {
        phoneNumberId: parsed.phoneNumberId,
        tokenTail: maskSecret(parsed.accessToken),
      };
    }
    case 'metaPage': {
      const parsed = metaPageDataSchema.parse(data);
      return {
        pageId: parsed.pageId,
        tokenTail: maskSecret(parsed.pageAccessToken),
      };
    }
    case 'googleOAuth': {
      const parsed = googleOAuthDataSchema.parse(data);
      return {
        email: parsed.email,
        scopes: parsed.scopes,
      };
    }
    case 'httpBearer': {
      const parsed = httpBearerDataSchema.parse(data);
      return {
        tokenTail: maskSecret(parsed.token),
      };
    }
    case 'httpBasic': {
      const parsed = httpBasicDataSchema.parse(data);
      return {
        username: parsed.username,
      };
    }
    case 'httpHeader': {
      const parsed = httpHeaderDataSchema.parse(data);
      return {
        headerName: parsed.headerName,
      };
    }
    default:
      return {};
  }
}
