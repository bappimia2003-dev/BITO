import { describe, it, expect } from 'vitest';
import { BitoError, BitoErrorClass } from '../src/errors.js';

describe('BitoError', () => {
  it('instantiates via constructor and factory', () => {
    const err1 = new BitoError('VALIDATION_FAILED', 'Invalid schema');
    expect(err1).toBeInstanceOf(Error);
    expect(err1).toBeInstanceOf(BitoErrorClass);
    expect(err1.code).toBe('VALIDATION_FAILED');
    expect(err1.httpStatus).toBe(500);
    expect(err1.retryable).toBe(false);

    // Without new
    const err2 = BitoError('NOT_FOUND', 'Workflow not found', {
      httpStatus: 404,
      retryable: false,
      details: { id: 'wf-1' },
    });
    expect(err2).toBeInstanceOf(Error);
    expect(err2.code).toBe('NOT_FOUND');
    expect(err2.httpStatus).toBe(404);
    expect(err2.details).toEqual({ id: 'wf-1' });
  });

  it('serializes to JSON properly', () => {
    const err = new BitoError('RATE_LIMITED', 'Too many requests', {
      httpStatus: 429,
      retryable: true,
      details: { retryAfterMs: 5000 },
    });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'BitoError',
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      retryable: true,
      httpStatus: 429,
      details: { retryAfterMs: 5000 },
    });
  });
});
