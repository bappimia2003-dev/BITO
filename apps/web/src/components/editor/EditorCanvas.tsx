'use client';

import React, { useMemo, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEditor } from './EditorContext.js';
import { CustomWorkflowNode } from './CustomWorkflowNode.js';
import { NodePalette } from './NodePalette.js';
import { NodeConfigPanel } from './NodeConfigPanel.js';
import { ConflictModal } from './ConflictModal.js';
import { RunModal } from './RunModal.js';
import { ShortcutsModal } from './ShortcutsModal.js';
import { QuickAddModal } from './QuickAddModal.js';
import type { FlowNode, FlowEdge } from './types.js';

export function EditorCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    deleteNode,
    selectedNodeId,
    setSelectedNodeId,
    undo,
    redo,
    saveNow,
    setIsQuickAddOpen,
    setIsShortcutsOpen,
  } = useEditor();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);

  const nodeTypes = useMemo(() => ({ custom: CustomWorkflowNode }), []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/bito-node-type');
      if (!type || !reactFlowInstance.current || !reactFlowWrapper.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, position);
    },
    [addNode]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't intercept typing in inputs/textareas
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveNow();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          deleteNode(selectedNodeId);
        }
      } else if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) {
        e.preventDefault();
        setIsQuickAddOpen(true);
      } else if (e.key === '?' || e.key === 'h') {
        e.preventDefault();
        setIsShortcutsOpen(true);
      } else if (e.key === 'Escape') {
        setSelectedNodeId(null);
      }
    },
    [
      undo,
      redo,
      saveNow,
      selectedNodeId,
      deleteNode,
      setIsQuickAddOpen,
      setIsShortcutsOpen,
      setSelectedNodeId,
    ]
  );

  return (
    <div
      ref={reactFlowWrapper}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="relative flex flex-1 w-full h-full overflow-hidden outline-none bg-background"
    >
      <NodePalette />

      <div className="relative flex-1 h-full" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(instance) => {
            reactFlowInstance.current = instance;
          }}
          onPaneClick={() => setSelectedNodeId(null)}
          snapToGrid={true}
          snapGrid={[16, 16]}
          fitView
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#64748b" />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            nodeColor="#3b82f6"
            maskColor="rgba(0, 0, 0, 0.4)"
            className="!border !border-border !bg-card !rounded-lg overflow-hidden"
          />
        </ReactFlow>

        <ConflictModal />
        <RunModal />
        <ShortcutsModal />
        <QuickAddModal />
      </div>

      <NodeConfigPanel />
    </div>
  );
}
