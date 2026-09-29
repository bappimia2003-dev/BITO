export interface BackoffOptions {
  backoff: 'fixed' | 'exponential';
  delayMs: number;
  jitter?: boolean;
  jitterFn?: () => number; // Optional custom RNG for deterministic testing
  retryAfterMs?: number;
  capMs?: number;
}

const DEFAULT_CAP_MS = 300_000; // 5 minutes

export function calculateBackoff(attempt: number, options: BackoffOptions): number {
  const cap = options.capMs ?? DEFAULT_CAP_MS;

  // If explicit retryAfterMs is provided (e.g. from 429 Retry-After), use it
  if (typeof options.retryAfterMs === 'number' && options.retryAfterMs > 0) {
    return Math.min(options.retryAfterMs, cap);
  }

  const baseDelay = options.delayMs;
  let delay: number;

  if (options.backoff === 'fixed') {
    delay = baseDelay;
  } else {
    // exponential: delayMs * 2^(attempt - 1)
    const factor = Math.pow(2, Math.max(0, attempt - 1));
    delay = baseDelay * factor;
  }

  // Add +-20% jitter
  if (options.jitter !== false) {
    const rng = options.jitterFn ?? Math.random;
    // Jitter factor between 0.8 and 1.2
    const jitterFactor = 0.8 + rng() * 0.4;
    delay = delay * jitterFactor;
  }

  return Math.min(Math.round(delay), cap);
}
