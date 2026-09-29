import { BitoError } from '@bito/shared';

export type FilterFn = (input: unknown, ...args: unknown[]) => unknown;

export const FILTERS: Record<string, FilterFn> = {
  upper(val: unknown): string {
    return String(val ?? '').toUpperCase();
  },

  lower(val: unknown): string {
    return String(val ?? '').toLowerCase();
  },

  trim(val: unknown): string {
    return String(val ?? '').trim();
  },

  length(val: unknown): number {
    if (val == null) return 0;
    if (typeof val === 'string' || Array.isArray(val)) return val.length;
    if (typeof val === 'object') return Object.keys(val).length;
    return String(val).length;
  },

  first(val: unknown): unknown {
    if (val == null) return undefined;
    if (Array.isArray(val)) return val[0];
    if (typeof val === 'string') return val[0];
    return undefined;
  },

  last(val: unknown): unknown {
    if (val == null) return undefined;
    if (Array.isArray(val)) return val[val.length - 1];
    if (typeof val === 'string') return val[val.length - 1];
    return undefined;
  },

  join(val: unknown, sep: unknown = ','): string {
    if (!Array.isArray(val)) return String(val ?? '');
    return val.join(String(sep));
  },

  split(val: unknown, sep: unknown = ','): string[] {
    if (val == null) return [];
    return String(val).split(String(sep));
  },

  replace(val: unknown, a: unknown, b: unknown): string {
    if (val == null) return '';
    return String(val).replaceAll(String(a ?? ''), String(b ?? ''));
  },

  slice(val: unknown, start: unknown, end?: unknown): unknown {
    const s = Number(start ?? 0);
    const e = end !== undefined ? Number(end) : undefined;
    if (Array.isArray(val)) return val.slice(s, e);
    return String(val ?? '').slice(s, e);
  },

  default(val: unknown, fallback: unknown): unknown {
    if (val === null || val === undefined || val === '') {
      return fallback;
    }
    return val;
  },

  json(val: unknown): string {
    return JSON.stringify(val);
  },

  parseJson(val: unknown): unknown {
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch {
      throw new BitoError('EXPR_SYNTAX', `Invalid JSON in parseJson filter: ${val}`);
    }
  },

  number(val: unknown): number {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  },

  string(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  },

  round(val: unknown, decimals: unknown = 0): number {
    const n = Number(val ?? 0);
    const d = Number(decimals ?? 0);
    const factor = Math.pow(10, d);
    return Math.round(n * factor) / factor;
  },

  floor(val: unknown): number {
    return Math.floor(Number(val ?? 0));
  },

  ceil(val: unknown): number {
    return Math.ceil(Number(val ?? 0));
  },

  abs(val: unknown): number {
    return Math.abs(Number(val ?? 0));
  },

  date(val: unknown, format?: unknown, _tz?: unknown): string {
    const d = val ? new Date(val as string | number) : new Date();
    if (isNaN(d.getTime())) return '';
    if (format === 'iso' || !format) {
      return d.toISOString();
    }
    if (format === 'date') {
      return d.toISOString().split('T')[0]!;
    }
    if (format === 'time') {
      return d.toISOString().split('T')[1]!.replace('Z', '');
    }
    return d.toISOString();
  },

  keys(val: unknown): string[] {
    if (val == null || typeof val !== 'object') return [];
    return Object.keys(val);
  },

  values(val: unknown): unknown[] {
    if (val == null || typeof val !== 'object') return [];
    return Object.values(val);
  },

  contains(val: unknown, target: unknown): boolean {
    if (val == null) return false;
    if (Array.isArray(val)) return val.includes(target);
    return String(val).includes(String(target ?? ''));
  },

  startsWith(val: unknown, target: unknown): boolean {
    if (val == null) return false;
    return String(val).startsWith(String(target ?? ''));
  },

  endsWith(val: unknown, target: unknown): boolean {
    if (val == null) return false;
    return String(val).endsWith(String(target ?? ''));
  },

  capitalize(val: unknown): string {
    const s = String(val ?? '');
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  },

  urlEncode(val: unknown): string {
    return encodeURIComponent(String(val ?? ''));
  },

  truncate(val: unknown, maxLen: unknown = 50): string {
    const s = String(val ?? '');
    const len = Number(maxLen ?? 50);
    if (s.length <= len) return s;
    return s.slice(0, len) + '...';
  },
};

export function getFilter(name: string): FilterFn {
  const fn = FILTERS[name];
  if (!fn) {
    throw new BitoError('EXPR_SYNTAX', `Unknown filter '${name}'`, {
      details: { filter: name },
    });
  }
  return fn;
}
