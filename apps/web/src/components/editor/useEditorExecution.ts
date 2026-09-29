'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { FlowNode, WorkflowNodeData, EditorExecutionState } from './types.js';

export function useEditorExecution(
  workflowId: string,
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>
) {
  const [activeExecution, setActiveExecution] = useState<EditorExecutionState | null>(null);
  const executionPollRef = useRef<NodeJS.Timeout | null>(null);

  const pollExecution = useCallback(
    async (execId: string) => {
      try {
        const res = await fetch(`/api/executions/${execId}`);
        if (!res.ok) return;
        const data = await res.json();
        setActiveExecution(data.execution ? { ...data.execution, nodeRuns: data.nodeRuns } : null);

        if (data.nodeRuns) {
          const statusMap = new Map<string, string>();
          for (const run of data.nodeRuns) {
            statusMap.set(run.nodeId, run.status.toLowerCase());
          }
          setNodes((nds) =>
            nds.map((n) => {
              const st = statusMap.get(n.id);
              if (!st || st === n.data.status) return n;
              return { ...n, data: { ...n.data, status: st as WorkflowNodeData['status'] } };
            })
          );
        }

        if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(data.execution?.status)) {
          if (executionPollRef.current) clearInterval(executionPollRef.current);
        }
      } catch {
        // Ignored
      }
    },
    [setNodes]
  );

  const runExecution = useCallback(
    async (payload?: unknown, triggerNodeId?: string): Promise<string | null> => {
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle' } })));

      try {
        const res = await fetch(`/api/workflows/${workflowId}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, triggerNodeId }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const execId = data.executionId as string;

        if (executionPollRef.current) clearInterval(executionPollRef.current);
        void pollExecution(execId);
        executionPollRef.current = setInterval(() => {
          void pollExecution(execId);
        }, 1000);

        return execId;
      } catch {
        return null;
      }
    },
    [workflowId, pollExecution, setNodes]
  );

  const cancelExecution = useCallback(async () => {
    if (!activeExecution) return;
    await fetch(`/api/executions/${activeExecution.id}/cancel`, { method: 'POST' });
    void pollExecution(activeExecution.id);
  }, [activeExecution, pollExecution]);

  useEffect(() => {
    return () => {
      if (executionPollRef.current) clearInterval(executionPollRef.current);
    };
  }, []);

  return {
    activeExecution,
    runExecution,
    cancelExecution,
  };
}
