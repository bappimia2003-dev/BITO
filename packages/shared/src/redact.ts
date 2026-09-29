const SENSITIVE_KEY_REGEX = /(token|secret|password|api[-_]?key|authorization|cookie|bearer)/i;

export function redact(value: unknown, secretsInUse: readonly string[] = []): unknown {
  const seen = new WeakSet<object>();

  const activeSecrets = secretsInUse.filter((s) => typeof s === 'string' && s.length > 0);

  function redactString(str: string): string {
    let result = str;
    for (const secret of activeSecrets) {
      if (result.includes(secret)) {
        result = result.replaceAll(secret, '***');
      }
    }
    return result;
  }

  function innerRedact(val: unknown): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (typeof val === 'string') {
      return redactString(val);
    }

    if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') {
      return val;
    }

    if (typeof val !== 'object') {
      return String(val);
    }

    if (seen.has(val)) {
      return '[Circular]';
    }
    seen.add(val);

    if (Array.isArray(val)) {
      return val.map((item) => innerRedact(item));
    }

    if (val instanceof Date) {
      return val.toISOString();
    }

    if (val instanceof Error) {
      const errObj: Record<string, unknown> = {
        name: val.name,
        message: redactString(val.message),
      };
      for (const [k, v] of Object.entries(val)) {
        if (SENSITIVE_KEY_REGEX.test(k)) {
          errObj[k] = '***';
        } else {
          errObj[k] = innerRedact(v);
        }
      }
      return errObj;
    }

    return innerRedactObject(val as Record<string, unknown>);
  }

  function innerRedactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const copy: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(obj)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        copy[key] = '***';
      } else {
        copy[key] = innerRedact(prop);
      }
    }
    return copy;
  }

  return innerRedact(value);
}
