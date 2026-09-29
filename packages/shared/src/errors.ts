export const BITO_ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'REAUTH_REQUIRED',
  'REVISION_CONFLICT',
  'CREDENTIAL_IN_USE',
  'CREDENTIAL_INVALID',
  'CREDENTIAL_TYPE_MISMATCH',
  'CREDENTIAL_REAUTH_REQUIRED',
  'NODE_TYPE_UNKNOWN',
  'CONFIG_INVALID',
  'EXPR_SYNTAX',
  'EXPR_UNRESOLVED',
  'EXPR_FORBIDDEN_PATH',
  'HTTP_ERROR',
  'SSRF_BLOCKED',
  'RESPONSE_TOO_LARGE',
  'TIMEOUT',
  'AI_BLOCKED',
  'AI_INVALID_OUTPUT',
  'AI_MAX_STEPS',
  'AI_TOOL_REFUSED',
  'JOB_ABANDONED',
  'MAX_NODE_RUNS_EXCEEDED',
  'EXECUTION_TIMEOUT',
  'OUTPUT_TOO_LARGE',
  'STOPPED_BY_USER_LOGIC',
  'WEBHOOK_SIGNATURE_INVALID',
  'WEBHOOK_REPLAY',
  'WEBHOOK_TOO_LARGE',
  'FILE_TYPE_UNSUPPORTED',
  'FILE_TOO_LARGE',
  'FILE_PARSE_FAILED',
  'PROVIDER_ERROR',
] as const;

export type BitoErrorCode = (typeof BITO_ERROR_CODES)[number];

export interface BitoErrorOptions {
  retryable?: boolean;
  httpStatus?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class BitoErrorClass extends Error {
  readonly code: BitoErrorCode | string;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: BitoErrorCode | string, message: string, options: BitoErrorOptions = {}) {
    super(message);
    this.name = 'BitoError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus ?? 500;
    this.details = options.details;
    if (options.cause) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, BitoErrorClass.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export type BitoError = BitoErrorClass;

export interface BitoErrorConstructor {
  new (code: BitoErrorCode | string, message: string, options?: BitoErrorOptions): BitoError;
  (code: BitoErrorCode | string, message: string, options?: BitoErrorOptions): BitoError;
}

const BitoErrorFactory = function (
  this: unknown,
  code: BitoErrorCode | string,
  message: string,
  options?: BitoErrorOptions
): BitoError {
  return new BitoErrorClass(code, message, options);
} as unknown as BitoErrorConstructor;

BitoErrorFactory.prototype = BitoErrorClass.prototype;

export const BitoError = BitoErrorFactory;
