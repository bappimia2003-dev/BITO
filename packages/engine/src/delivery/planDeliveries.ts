import type { Item, WorkflowSnapshotConnection } from '@bito/shared';

export interface PlannedDelivery {
  connectionId: string;
  targetNodeId: string;
  targetPort: string;
  sourcePort: string;
  items: Item[];
  deliveryKey?: string;
}

export function planDeliveries(
  connections: WorkflowSnapshotConnection[],
  sourceNodeId: string,
  outputs: Record<string, Item[]>,
  nodeRunId?: string
): PlannedDelivery[] {
  const deliveries: PlannedDelivery[] = [];

  // Filter connections originating from sourceNodeId
  const outgoingConnections = connections.filter((conn) => conn.sourceNodeId === sourceNodeId);

  for (const conn of outgoingConnections) {
    const portItems = outputs[conn.sourcePort];

    // Empty outputs stop the branch: if a port emits [] or is undefined, no job is created
    if (!portItems || portItems.length === 0) {
      continue;
    }

    deliveries.push({
      connectionId: conn.id,
      targetNodeId: conn.targetNodeId,
      targetPort: conn.targetPort,
      sourcePort: conn.sourcePort,
      items: portItems,
      deliveryKey: nodeRunId ? `${nodeRunId}:${conn.id}` : undefined,
    });
  }

  return deliveries;
}
