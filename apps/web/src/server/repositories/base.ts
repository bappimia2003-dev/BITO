import { z } from 'zod';

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const camelKey = toCamelCase(key);
    if (val instanceof Date) {
      result[camelKey] = val.toISOString();
    } else {
      result[camelKey] = val;
    }
  }
  return result;
}

export function parseRow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  row: Record<string, unknown>
): z.output<TSchema> {
  const mapped = mapRow(row);
  return schema.parse(mapped);
}
