import type { CatalogNode, NodeDefinition } from '@bito/shared';
import { BitoError } from '@bito/shared';

export class NodeRegistry {
  private definitions = new Map<string, NodeDefinition>();

  public register(def: NodeDefinition): void {
    if (this.definitions.has(def.type)) {
      throw new BitoError('VALIDATION_FAILED', `Node type '${def.type}' is already registered`, {
        details: { type: def.type },
      });
    }
    this.definitions.set(def.type, def);
  }

  public get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  public has(type: string): boolean {
    return this.definitions.has(type);
  }

  public list(): NodeDefinition[] {
    return Array.from(this.definitions.values());
  }

  public clear(): void {
    this.definitions.clear();
  }

  public getCatalog(): CatalogNode[] {
    return this.list().map((def) => ({
      type: def.type,
      version: def.version,
      name: def.name,
      description: def.description,
      category: def.category,
      icon: def.icon,
      inputs: def.inputs,
      outputs: def.outputs,
      mode: def.mode,
      stateful: def.stateful,
      fields: def.fields,
      inputSchema: def.inputSchema,
      outputSchema: def.outputSchema,
      credentials: def.credentials,
      toolSpec: def.toolSpec,
    }));
  }
}

export const defaultNodeRegistry = new NodeRegistry();
