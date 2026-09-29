import { NodeRegistry } from '../../src/index.js';
import { z } from 'zod';

export function createTestRegistry(): NodeRegistry {
  const registry = new NodeRegistry();

  registry.register({
    type: 'trigger.manual',
    version: 1,
    name: 'Manual Trigger',
    description: 'Manual',
    category: 'TRIGGERS',
    icon: 'play',
    inputs: [],
    outputs: [{ id: 'main', label: 'Main' }],
    mode: 'batch',
    fields: [],
    configSchema: z.object({}),
    outputSchema: {},
    credentials: [],
    execute: async () => ({ outputs: {} }),
  });

  registry.register({
    type: 'trigger.webhook',
    version: 1,
    name: 'Webhook Trigger',
    description: 'Webhook',
    category: 'TRIGGERS',
    icon: 'webhook',
    inputs: [],
    outputs: [{ id: 'main', label: 'Main' }],
    mode: 'batch',
    fields: [],
    configSchema: z.object({ path: z.string().optional() }),
    outputSchema: {},
    credentials: [],
    execute: async () => ({ outputs: {} }),
  });

  registry.register({
    type: 'data.transform',
    version: 1,
    name: 'Data Transform',
    description: 'Transform',
    category: 'DATA',
    icon: 'pen',
    inputs: [{ id: 'main', label: 'Main' }],
    outputs: [{ id: 'main', label: 'Main' }],
    mode: 'perItem',
    fields: [],
    configSchema: z.object({
      requiredField: z.string().min(1),
      exprField: z.string().optional(),
    }),
    outputSchema: {},
    credentials: [{ type: 'telegramBot', required: true }],
    execute: async () => ({ outputs: {} }),
  });

  registry.register({
    type: 'logic.merge',
    version: 1,
    name: 'Merge',
    description: 'Merge',
    category: 'LOGIC',
    icon: 'git-merge',
    inputs: [
      { id: 'in_1', label: 'Input 1' },
      { id: 'in_2', label: 'Input 2' },
    ],
    outputs: [{ id: 'main', label: 'Main' }],
    mode: 'batch',
    fields: [],
    configSchema: z.object({}),
    outputSchema: {},
    credentials: [],
    execute: async () => ({ outputs: {} }),
  });

  registry.register({
    type: 'logic.foreach',
    version: 1,
    name: 'ForEach',
    description: 'ForEach',
    category: 'LOGIC',
    icon: 'repeat',
    inputs: [
      { id: 'main', label: 'Main' },
      { id: 'loop', label: 'Loop' },
    ],
    outputs: [
      { id: 'each', label: 'Each' },
      { id: 'done', label: 'Done' },
    ],
    mode: 'batch',
    fields: [],
    configSchema: z.object({}),
    outputSchema: {},
    credentials: [],
    execute: async () => ({ outputs: {} }),
  });

  registry.register({
    type: 'custom.rule',
    version: 1,
    name: 'Custom Rule Node',
    description: 'Custom',
    category: 'UTILITY',
    icon: 'star',
    inputs: [{ id: 'main', label: 'Main' }],
    outputs: [{ id: 'main', label: 'Main' }],
    mode: 'batch',
    fields: [],
    configSchema: z.object({}),
    outputSchema: {},
    credentials: [],
    validate: () => [
      {
        severity: 'warning',
        code: 'CUSTOM_NODE_WARNING',
        message: 'Custom node validation triggered',
      },
    ],
    execute: async () => ({ outputs: {} }),
  });

  return registry;
}
