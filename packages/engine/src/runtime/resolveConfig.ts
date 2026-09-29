import { resolveTemplate } from '../expressions/template.js';

export function resolveConfigExpressions(config: unknown, scope: Record<string, unknown>): unknown {
  if (typeof config === 'string') {
    if (config.includes('{{')) {
      return resolveTemplate(config, scope);
    }
    return config;
  }

  if (Array.isArray(config)) {
    return config.map((item) => resolveConfigExpressions(item, scope));
  }

  if (config !== null && typeof config === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(config as Record<string, unknown>)) {
      resolved[key] = resolveConfigExpressions(val, scope);
    }
    return resolved;
  }

  return config;
}
