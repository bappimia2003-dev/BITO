import { describe, it, expect } from 'vitest';
import { allStandardNodes, defaultNodeRegistry, initializeRegistry } from '../src/index.js';

describe('Registry Consistency & Node Definitions Suite', () => {
  it('registers all standard nodes without errors', () => {
    const reg = initializeRegistry();
    expect(reg.list().length).toBeGreaterThanOrEqual(11);
  });

  it('generates a clean, serializable catalog without functions or secrets', () => {
    const catalog = defaultNodeRegistry.getCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(11);

    for (const item of catalog) {
      expect(item.type).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.icon).toBeDefined();
      expect(item.inputs).toBeDefined();
      expect(item.outputs).toBeDefined();

      // Serialization check: must round-trip through JSON cleanly
      const serialized = JSON.stringify(item);
      const deserialized = JSON.parse(serialized);
      expect(deserialized.type).toBe(item.type);

      // Verify no functions or sensitive properties leak
      expect((item as Record<string, unknown>).execute).toBeUndefined();
      expect((item as Record<string, unknown>).validate).toBeUndefined();
      expect((item as Record<string, unknown>).onError).toBeUndefined();
      expect((item as Record<string, unknown>).configSchema).toBeUndefined();
    }
  });

  it('asserts each node default config built from fields passes its configSchema', () => {
    for (const node of allStandardNodes) {
      const defaultConfig: Record<string, unknown> = {};

      for (const field of node.fields) {
        if (field.default !== undefined) {
          defaultConfig[field.name] = field.default;
        } else if (field.required) {
          // Provide minimal valid required dummy values for required fields
          if (field.type === 'string' || field.type === 'text') {
            defaultConfig[field.name] = 'test_value';
          } else if (field.type === 'number') {
            defaultConfig[field.name] = 1;
          } else if (field.type === 'boolean') {
            defaultConfig[field.name] = true;
          }
        }
      }

      const parseResult = node.configSchema.safeParse(defaultConfig);
      if (!parseResult.success) {
        console.error(`Validation failed for node ${node.type}:`, parseResult.error.format());
      }
      expect(
        parseResult.success,
        `Node '${node.type}' default config from fields must pass configSchema`
      ).toBe(true);
    }
  });

  it('validates node type naming convention (lowercase, dotted)', () => {
    for (const node of allStandardNodes) {
      expect(node.type).toMatch(/^[a-z]+(\.[a-z]+)+$/);
      expect(node.version).toBe(1);
    }
  });
});
