'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import type { Issue } from '@bito/shared';
import type {
  FlowNode,
  FlowEdge,
  WorkflowMeta,
  WorkflowNodeData,
  NodeDefinitionMeta,
  EditorExecutionState,
} from './types.js';
import { useEditorHistory } from './useEditorHistory.js';
import { useEditorAutosave, type ConflictInfo } from './useEditorAutosave.js';
import { useEditorExecution } from './useEditorExecution.js';

interface EditorContextValue {
  workflow: WorkflowMeta;
  nodes: FlowNode[];
  edges: FlowEdge[];
  catalog: Record<string, NodeDefinitionMeta>;
  credentials: Array<{ id: string; name: string; type: string }>;
  selectedNodeId: string | null;
  selectedNode: FlowNode | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
  lastSavedAt: Date | null;
  conflictInfo: ConflictInfo | null;
  issues: Issue[];
  activeExecution: EditorExecutionState | null;
  isRunModalOpen: boolean;
  isShortcutsOpen: boolean;
  isPaletteOpen: boolean;
  isQuickAddOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<FlowEdge>;
  onConnect: OnConnect;
  setSelectedNodeId: (id: string | null) => void;
  setIsRunModalOpen: (open: boolean) => void;
  setIsShortcutsOpen: (open: boolean) => void;
  setIsPaletteOpen: (open: boolean) => void;
  setIsQuickAddOpen: (open: boolean) => void;
  addNode: (type: string, position?: { x: number; y: number }) => void;
  deleteNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
  updateWorkflowMeta: (patch: Partial<WorkflowMeta>) => void;
  saveNow: (forceRevision?: number) => Promise<boolean>;
  resolveConflict: (choice: 'reload' | 'overwrite') => Promise<void>;
  undo: () => void;
  redo: () => void;
  validate: () => Promise<void>;
  runExecution: (payload?: unknown, triggerNodeId?: string) => Promise<string | null>;
  cancelExecution: () => Promise<void>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return ctx;
}

export interface EditorProviderProps {
  initialWorkflow: WorkflowMeta;
  initialNodes: FlowNode[];
  initialEdges: FlowEdge[];
  catalog: Record<string, NodeDefinitionMeta>;
  credentials: Array<{ id: string; name: string; type: string }>;
  children: React.ReactNode;
}

export function EditorProvider({
  initialWorkflow,
  initialNodes,
  initialEdges,
  catalog,
  credentials,
  children,
}: EditorProviderProps) {
  const [workflow, setWorkflow] = useState<WorkflowMeta>(initialWorkflow);
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);

  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const {
    canUndo,
    canRedo,
    pushHistory,
    undo: performUndo,
    redo: performRedo,
  } = useEditorHistory(initialNodes, initialEdges);

  const { saveStatus, lastSavedAt, conflictInfo, saveNow, resolveConflict, triggerAutosave } =
    useEditorAutosave({
      workflow,
      setWorkflow,
      nodes,
      setNodes,
      edges,
      setEdges,
    });

  const { activeExecution, runExecution, cancelExecution } = useEditorExecution(
    workflow.id,
    setNodes
  );

  const undo = useCallback(() => performUndo(setNodes, setEdges), [performUndo]);
  const redo = useCallback(() => performRedo(setNodes, setEdges), [performRedo]);

  const onNodesChange: OnNodesChange<FlowNode> = useCallback(
    (changes) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);
        pushHistory(updated, edges);
        return updated;
      });
      triggerAutosave();
    },
    [edges, pushHistory, triggerAutosave]
  );

  const onEdgesChange: OnEdgesChange<FlowEdge> = useCallback(
    (changes) => {
      setEdges((eds) => {
        const updated = applyEdgeChanges(changes, eds);
        pushHistory(nodes, updated);
        return updated;
      });
      triggerAutosave();
    },
    [nodes, pushHistory, triggerAutosave]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source === connection.target) return;
      const exists = edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle &&
          e.targetHandle === connection.targetHandle
      );
      if (exists) return;

      setEdges((eds) => {
        const updated = addEdge({ ...connection, animated: true }, eds);
        pushHistory(nodes, updated);
        return updated;
      });
      triggerAutosave();
    },
    [edges, nodes, pushHistory, triggerAutosave]
  );

  const addNode = useCallback(
    (type: string, position = { x: 300, y: 200 }) => {
      const def = catalog[type];
      const prefix = (type.split('_').pop() || 'node').toLowerCase();
      const existingKeys = new Set(nodes.map((n) => n.data.key));
      let key = prefix;
      let counter = 1;
      while (existingKeys.has(key)) {
        counter++;
        key = `${prefix}_${counter}`;
      }

      const id = crypto.randomUUID();
      const newNode: FlowNode = {
        id,
        type: 'custom',
        position,
        data: {
          nodeId: id,
          key,
          type,
          typeVersion: def?.version ?? 1,
          name: def?.name ?? type,
          config: {},
          settings: { retries: 0, backoff: 'fixed', onError: 'stop' },
          status: 'idle',
        },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        pushHistory(updated, edges);
        return updated;
      });
      setSelectedNodeId(id);
      triggerAutosave();
    },
    [catalog, nodes, edges, pushHistory, triggerAutosave]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const updated = nds.filter((n) => n.id !== nodeId);
        setEdges((eds) => {
          const updatedEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
          pushHistory(updated, updatedEdges);
          return updatedEdges;
        });
        return updated;
      });
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      triggerAutosave();
    },
    [selectedNodeId, pushHistory, triggerAutosave]
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<WorkflowNodeData>) => {
      setNodes((nds) => {
        const updated = nds.map((n) => {
          if (n.id !== nodeId) return n;
          return { ...n, data: { ...n.data, ...patch } };
        });
        pushHistory(updated, edges);
        return updated;
      });
      triggerAutosave();
    },
    [edges, pushHistory, triggerAutosave]
  );

  const updateWorkflowMeta = useCallback(
    (patch: Partial<WorkflowMeta>) => {
      setWorkflow((prev) => ({ ...prev, ...patch }));
      triggerAutosave();
    },
    [triggerAutosave]
  );

  const validate = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: nodes.map((n) => ({
            id: n.id,
            key: n.data.key,
            type: n.data.type,
            name: n.data.name,
            config: n.data.config,
            settings: n.data.settings,
            credentialId: n.data.credentialId,
          })),
          connections: edges.map((e) => ({
            sourceNodeId: e.source,
            sourcePort: e.sourceHandle || 'main',
            targetNodeId: e.target,
            targetPort: e.targetHandle || 'main',
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
      }
    } catch {
      // Ignored
    }
  }, [workflow.id, nodes, edges]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const value: EditorContextValue = {
    workflow,
    nodes,
    edges,
    catalog,
    credentials,
    selectedNodeId,
    selectedNode,
    saveStatus,
    lastSavedAt,
    conflictInfo,
    issues,
    activeExecution,
    isRunModalOpen,
    isShortcutsOpen,
    isPaletteOpen,
    isQuickAddOpen,
    canUndo,
    canRedo,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setSelectedNodeId,
    setIsRunModalOpen,
    setIsShortcutsOpen,
    setIsPaletteOpen,
    setIsQuickAddOpen,
    addNode,
    deleteNode,
    updateNodeData,
    updateWorkflowMeta,
    saveNow,
    resolveConflict,
    undo,
    redo,
    validate,
    runExecution,
    cancelExecution,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
