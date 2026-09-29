import { describe, it, expect } from 'vitest';
import { planDeliveries, calculateBackoff } from '../src/index.js';
import type { Item, WorkflowSnapshotConnection } from '@bito/shared';

describe('planDeliveries & calculateBackoff Tests', () => {
  describe('planDeliveries', () => {
    it('plans delivery to target node on matching source port', () => {
      const connections: WorkflowSnapshotConnection[] = [
        {
          id: 'c1',
          sourceNodeId: 'node-1',
          sourcePort: 'main',
          targetNodeId: 'node-2',
          targetPort: 'main',
        },
      ];
      const items: Item[] = [{ json: { hello: 'world' } }];
      const outputs = { main: items };

      const deliveries = planDeliveries(connections, 'node-1', outputs, 'nr-100');
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toEqual({
        connectionId: 'c1',
        targetNodeId: 'node-2',
        targetPort: 'main',
        sourcePort: 'main',
        items,
        deliveryKey: 'nr-100:c1',
      });
    });

    it('routes items to multiple parallel connections', () => {
      const connections: WorkflowSnapshotConnection[] = [
        {
          id: 'c1',
          sourceNodeId: 'node-1',
          sourcePort: 'main',
          targetNodeId: 'node-2',
          targetPort: 'main',
        },
        {
          id: 'c2',
          sourceNodeId: 'node-1',
          sourcePort: 'main',
          targetNodeId: 'node-3',
          targetPort: 'main',
        },
      ];
      const items: Item[] = [{ json: { parallel: true } }];
      const deliveries = planDeliveries(connections, 'node-1', { main: items });

      expect(deliveries).toHaveLength(2);
      expect(deliveries[0]!.targetNodeId).toBe('node-2');
      expect(deliveries[1]!.targetNodeId).toBe('node-3');
    });

    it('stops branch when output port is empty array', () => {
      const connections: WorkflowSnapshotConnection[] = [
        {
          id: 'c1',
          sourceNodeId: 'node-1',
          sourcePort: 'true',
          targetNodeId: 'node-2',
          targetPort: 'main',
        },
        {
          id: 'c2',
          sourceNodeId: 'node-1',
          sourcePort: 'false',
          targetNodeId: 'node-3',
          targetPort: 'main',
        },
      ];
      const outputs = {
        true: [{ json: { match: true } }],
        false: [], // empty branch
      };

      const deliveries = planDeliveries(connections, 'node-1', outputs);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]!.connectionId).toBe('c1');
    });

    it('ignores connections from other source nodes', () => {
      const connections: WorkflowSnapshotConnection[] = [
        {
          id: 'c1',
          sourceNodeId: 'other-node',
          sourcePort: 'main',
          targetNodeId: 'node-2',
          targetPort: 'main',
        },
      ];
      const deliveries = planDeliveries(connections, 'node-1', { main: [{ json: {} }] });
      expect(deliveries).toHaveLength(0);
    });
  });

  describe('calculateBackoff', () => {
    it('calculates fixed backoff without jitter', () => {
      const delay = calculateBackoff(1, { backoff: 'fixed', delayMs: 1000, jitter: false });
      expect(delay).toBe(1000);
      const delayAttempt3 = calculateBackoff(3, { backoff: 'fixed', delayMs: 1000, jitter: false });
      expect(delayAttempt3).toBe(1000);
    });

    it('calculates exponential backoff without jitter', () => {
      const d1 = calculateBackoff(1, { backoff: 'exponential', delayMs: 1000, jitter: false });
      expect(d1).toBe(1000); // 1000 * 2^0
      const d2 = calculateBackoff(2, { backoff: 'exponential', delayMs: 1000, jitter: false });
      expect(d2).toBe(2000); // 1000 * 2^1
      const d3 = calculateBackoff(3, { backoff: 'exponential', delayMs: 1000, jitter: false });
      expect(d3).toBe(4000); // 1000 * 2^2
      const d4 = calculateBackoff(4, { backoff: 'exponential', delayMs: 1000, jitter: false });
      expect(d4).toBe(8000); // 1000 * 2^3
    });

    it('applies +-20% jitter correctly', () => {
      // Deterministic min jitter (0.8)
      const dMin = calculateBackoff(1, {
        backoff: 'fixed',
        delayMs: 1000,
        jitter: true,
        jitterFn: () => 0,
      });
      expect(dMin).toBe(800);

      // Deterministic max jitter (1.2)
      const dMax = calculateBackoff(1, {
        backoff: 'fixed',
        delayMs: 1000,
        jitter: true,
        jitterFn: () => 1,
      });
      expect(dMax).toBe(1200);
    });

    it('caps delay at capMs (default 300,000 ms)', () => {
      const hugeDelay = calculateBackoff(20, {
        backoff: 'exponential',
        delayMs: 1000,
        jitter: false,
      });
      expect(hugeDelay).toBe(300_000);
    });

    it('prioritizes explicit retryAfterMs parameter', () => {
      const d = calculateBackoff(1, {
        backoff: 'exponential',
        delayMs: 1000,
        retryAfterMs: 45000,
      });
      expect(d).toBe(45000);
    });
  });
});
