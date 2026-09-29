'use client';

import React, { useState } from 'react';
import { X, Play, Loader2, Code2 } from 'lucide-react';
import { useEditor } from './EditorContext.js';

export function RunModal() {
  const { nodes, isRunModalOpen, setIsRunModalOpen, runExecution } = useEditor();

  const triggerNodes = nodes.filter(
    (n) => n.data.type === 'manual' || n.data.type.startsWith('trigger_')
  );
  const defaultTriggerId = triggerNodes[0]?.id || nodes[0]?.id || '';

  const [selectedTriggerId, setSelectedTriggerId] = useState(defaultTriggerId);
  const [payloadText, setPayloadText] = useState('{\n  "message": "Manual test run"\n}');
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  if (!isRunModalOpen) return null;

  const handleRun = async () => {
    setError(null);
    let parsed: unknown = {};
    if (payloadText.trim()) {
      try {
        parsed = JSON.parse(payloadText);
      } catch (err: unknown) {
        setError(`Invalid JSON payload: ${(err as Error).message}`);
        return;
      }
    }

    setIsRunning(true);
    try {
      const execId = await runExecution(parsed, selectedTriggerId || undefined);
      if (execId) {
        setIsRunModalOpen(false);
      } else {
        setError('Failed to trigger workflow execution');
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={() => setIsRunModalOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-primary fill-current" />
            <h3 className="text-sm font-semibold text-foreground">Run Workflow Test</h3>
          </div>
          <button
            onClick={() => setIsRunModalOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* Trigger Node Selection */}
          {triggerNodes.length > 1 && (
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">Select Trigger Node</label>
              <select
                value={selectedTriggerId}
                onChange={(e) => setSelectedTriggerId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 outline-none focus:border-primary"
              >
                {triggerNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.name} ({n.data.key})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payload Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-foreground flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Test Payload (JSON)</span>
              </label>
              <button
                type="button"
                onClick={() => setPayloadText('{\n  "message": "Manual test run"\n}')}
                className="text-[11px] text-primary hover:underline"
              >
                Reset sample
              </button>
            </div>
            <textarea
              rows={6}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="w-full rounded-md border border-border bg-background p-2.5 font-mono text-xs outline-none focus:border-primary"
              placeholder="{}"
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/15 p-2.5 text-destructive font-mono text-[11px]">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
          <button
            type="button"
            onClick={() => setIsRunModalOpen(false)}
            className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={handleRun}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{isRunning ? 'Starting...' : 'Execute Workflow'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
