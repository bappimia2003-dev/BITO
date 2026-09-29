'use client';

import { useState, useRef, useCallback } from 'react';
import type { FlowNode, FlowEdge, GraphSnapshot } from './types.js';

const MAX_HISTORY = 50;

export function useEditorHistory(initialNodes: FlowNode[], initialEdges: FlowEdge[]) {
  const [history, setHistory] = useState<GraphSnapshot[]>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const isHistoryAction = useRef(false);

  const pushHistory = useCallback(
    (newNodes: FlowNode[], newEdges: FlowEdge[]) => {
      if (isHistoryAction.current) return;
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIdx + 1);
        const next = [...trimmed, { nodes: newNodes, edges: newEdges }];
        if (next.length > MAX_HISTORY) next.shift();
        return next;
      });
      setHistoryIdx((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    },
    [historyIdx]
  );

  const undo = useCallback(
    (
      setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>,
      setEdges: React.Dispatch<React.SetStateAction<FlowEdge[]>>
    ) => {
      if (historyIdx > 0) {
        isHistoryAction.current = true;
        const target = history[historyIdx - 1];
        if (target) {
          setNodes(target.nodes);
          setEdges(target.edges);
          setHistoryIdx(historyIdx - 1);
        }
        setTimeout(() => {
          isHistoryAction.current = false;
        }, 50);
      }
    },
    [history, historyIdx]
  );

  const redo = useCallback(
    (
      setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>,
      setEdges: React.Dispatch<React.SetStateAction<FlowEdge[]>>
    ) => {
      if (historyIdx < history.length - 1) {
        isHistoryAction.current = true;
        const target = history[historyIdx + 1];
        if (target) {
          setNodes(target.nodes);
          setEdges(target.edges);
          setHistoryIdx(historyIdx + 1);
        }
        setTimeout(() => {
          isHistoryAction.current = false;
        }, 50);
      }
    },
    [history, historyIdx]
  );

  return {
    canUndo: historyIdx > 0,
    canRedo: historyIdx < history.length - 1,
    pushHistory,
    undo,
    redo,
  };
}
