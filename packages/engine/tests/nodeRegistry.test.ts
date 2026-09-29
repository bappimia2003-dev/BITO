import { describe, it, expect, beforeEach } from 'vitest';
import { NodeRegistry } from '../src/index.js';
import { BitoError, type NodeDefinition } from '@bito/shared';
import { z } from 'zod';

describe('NodeRegistry Unit Tests', () => {
  let registry: NodeRegistry;

  const sampleNode: NodeDefinition = {
    type: 'test.sample',
    version: 1,
    name: 'Sample Node',
    description: 'A sample node for testing',
    category: 'UTILITY',
    icon: 'wrench',
    inputs: [{ id: 'main', label: 'Main' }],
    outputs: [{ id: 'main', label: 'Main' }],
    mode: 'batch',
    fields: [
      {
        name: 'param1',
        label: 'Param 1',
        type: 'string',
        default: 'val1',
      },
    ],
    configSchema: z.object({ param1: z.string().default('val1') }),
    outputSchema: { type: 'object' },
    credentials: [],
    execute: async () => ({ outputs: {} }),
  };

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it('registers and retrieves a node definition', () => {
    registry.register(sampleNode);
    expect(registry.has('test.sample')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
    expect(registry.get('test.sample')).toBe(sampleNode);
    expect(registry.get('nonexistent')).toBeUndefined();
    expect(registry.list()).toHaveLength(1);
  });

  it('throws VALIDATION_FAILED when registering duplicate node type', () => {
    registry.register(sampleNode);
    expect(() => registry.register(sampleNode)).toThrowError(BitoError);
  });

  it('clears all registered definitions', () => {
    registry.register(sampleNode);
    expect(registry.list()).toHaveLength(1);
    registry.clear();
    expect(registry.list()).toHaveLength(0);
    expect(registry.has('test.sample')).toBe(false);
  });

  it('generates serializable catalog projection stripping executable functions', () => {
    registry.register(sampleNode);
    const catalog = registry.getCatalog();
    expect(catalog).toHaveLength(1);

    const item = catalog[0]!;
    expect(item.type).toBe('test.sample');
    expect(item.version).toBe(1);
    expect(item.name).toBe('Sample Node');
    expect(item.description).toBe('A sample node for testing');
    expect(item.category).toBe('UTILITY');
    expect(item.icon).toBe('wrench');

    // Confirm no functions exist
    expect((item as Record<string, unknown>).execute).toBeUndefined();
    expect((item as Record<string, unknown>).configSchema).toBeUndefined();

    // Roundtrip JSON
    const jsonStr = JSON.stringify(catalog);
    expect(JSON.parse(jsonStr)[0].type).toBe('test.sample');
  });
});
