import { defaultNodeRegistry, NodeRegistry } from '@bito/engine';
import { manualTriggerNode } from './triggers/manual/index.js';
import { webhookTriggerNode } from './triggers/webhook/index.js';
import { setNode } from './data/set/index.js';
import { ifNode } from './logic/if/index.js';
import { noopNode } from './logic/noop/index.js';
import { waitNode } from './logic/wait/index.js';
import { stopNode } from './logic/stop/index.js';
import { mergeNode } from './logic/merge/index.js';
import { forEachNode } from './logic/foreach/index.js';
import { httpNode } from './api/http/index.js';
import { telegramSendNode } from './notification/telegram/index.js';

export const allStandardNodes = [
  manualTriggerNode,
  webhookTriggerNode,
  setNode,
  ifNode,
  noopNode,
  waitNode,
  stopNode,
  mergeNode,
  forEachNode,
  httpNode,
  telegramSendNode,
];

export function initializeRegistry(registry: NodeRegistry = defaultNodeRegistry): NodeRegistry {
  for (const node of allStandardNodes) {
    if (!registry.has(node.type)) {
      registry.register(node as never);
    }
  }
  return registry;
}

// Auto-initialize default singleton
initializeRegistry(defaultNodeRegistry);

export { defaultNodeRegistry, NodeRegistry };
