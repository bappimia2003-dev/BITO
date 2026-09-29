'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { FlowNode, FlowEdge, WorkflowMeta, WorkflowNodeData } from './types.js';

export interface ConflictInfo {
  serverRevision: number;
}

export function useEditorAutosave({
  workflow,
  setWorkflow,
  nodes,
  setNodes,
  edges,
  setEdges,
}: {
  workflow: WorkflowMeta;
  setWorkflow: React.Dispatch<React.SetStateAction<WorkflowMeta>>;
  nodes: FlowNode[];
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  edges: FlowEdge[];
  setEdges: React.Dispatch<React.SetStateAction<FlowEdge[]>>;
}) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>(
    'idle'
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);

  const isDirty = useRef(false);
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);

  const saveNow = useCallback(
    async (forceRevision?: number): Promise<boolean> => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      setSaveStatus('saving');

      const payload = {
        expectedRevision: forceRevision !== undefined ? forceRevision : workflow.revision,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        settings: workflow.settings,
        nodes: nodes.map((n) => ({
          id: n.id,
          key: n.data.key,
          type: n.data.type,
          typeVersion: n.data.typeVersion ?? 1,
          name: n.data.name,
          positionX: Math.round(n.position.x),
          positionY: Math.round(n.position.y),
          config: n.data.config ?? {},
          credentialId: n.data.credentialId ?? null,
          settings: n.data.settings ?? {},
        })),
        connections: edges.map((e) => ({
          sourceNodeId: e.source,
          sourcePort: e.sourceHandle || 'main',
          targetNodeId: e.target,
          targetPort: e.targetHandle || 'main',
        })),
      };

      try {
        const res = await fetch(`/api/workflows/${workflow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          setSaveStatus('conflict');
          setConflictInfo({
            serverRevision: errData.error?.details?.currentRevision ?? workflow.revision + 1,
          });
          return false;
        }

        if (!res.ok) {
          setSaveStatus('error');
          return false;
        }

        const data = await res.json();
        setWorkflow((prev) => ({ ...prev, revision: data.workflow.revision }));
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        isDirty.current = false;
        setConflictInfo(null);
        return true;
      } catch {
        setSaveStatus('error');
        return false;
      }
    },
    [workflow, nodes, edges, setWorkflow]
  );

  const triggerAutosave = useCallback(() => {
    isDirty.current = true;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (isDirty.current) {
        void saveNow();
      }
    }, 1500);
  }, [saveNow]);

  const resolveConflict = useCallback(
    async (choice: 'reload' | 'overwrite') => {
      if (choice === 'reload') {
        const res = await fetch(`/api/workflows/${workflow.id}`);
        if (res.ok) {
          const data = await res.json();
          setWorkflow(data.workflow);
          setNodes(
            data.nodes.map((n: WorkflowNodeData & { positionX: number; positionY: number }) => ({
              id: n.nodeId || (n as unknown as { id: string }).id,
              type: 'custom',
              position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
              data: { ...n, status: 'idle' },
            }))
          );
          setEdges(
            data.connections.map(
              (c: {
                sourceNodeId: string;
                sourcePort: string;
                targetNodeId: string;
                targetPort: string;
              }) => ({
                id: `${c.sourceNodeId}:${c.sourcePort}->${c.targetNodeId}:${c.targetPort}`,
                source: c.sourceNodeId,
                sourceHandle: c.sourcePort,
                target: c.targetNodeId,
                targetHandle: c.targetPort,
              })
            )
          );
          setConflictInfo(null);
          setSaveStatus('saved');
          isDirty.current = false;
        }
      } else {
        if (conflictInfo) {
          await saveNow(conflictInfo.serverRevision);
        }
      }
    },
    [workflow.id, conflictInfo, saveNow, setWorkflow, setNodes, setEdges]
  );

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  return {
    saveStatus,
    lastSavedAt,
    conflictInfo,
    saveNow,
    resolveConflict,
    triggerAutosave,
  };
}
