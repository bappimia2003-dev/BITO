'use client';

import React, { useState } from 'react';
import { X, Trash2, Sliders, Settings2, History, BookOpen, Clock, AlertCircle } from 'lucide-react';
import { useEditor } from './EditorContext.js';
import { FormGenerator } from './FormGenerator.js';
import { WebhookConfigDetails } from './WebhookConfigDetails.js';
import { ScheduleConfigDetails } from './ScheduleConfigDetails.js';

type TabType = 'parameters' | 'settings' | 'last_run' | 'docs';

export function NodeConfigPanel() {
  const {
    workflow,
    selectedNode,
    catalog,
    credentials,
    activeExecution,
    setSelectedNodeId,
    deleteNode,
    updateNodeData,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<TabType>('parameters');

  if (!selectedNode) return null;

  const { data, id } = selectedNode;
  const def = catalog[data.type];

  const handleConfigChange = (key: string, value: unknown) => {
    updateNodeData(id, {
      config: { ...data.config, [key]: value },
    });
  };

  const handleCredentialChange = (credentialId: string | null) => {
    updateNodeData(id, { credentialId });
  };

  const handleSettingsChange = (patch: Record<string, unknown>) => {
    updateNodeData(id, {
      settings: { ...data.settings, ...patch },
    });
  };

  const latestRun = activeExecution?.nodeRuns.find((r) => r.nodeId === id);

  return (
    <aside className="flex h-full w-80 md:w-96 flex-col border-l border-border bg-card text-card-foreground shadow-lg select-none z-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-3.5">
        <div className="truncate pr-2">
          <input
            type="text"
            value={data.name}
            onChange={(e) => updateNodeData(id, { name: e.target.value })}
            className="w-full bg-transparent text-sm font-semibold outline-none hover:bg-muted/50 focus:bg-muted px-1 rounded truncate"
          />
          <div className="flex items-center gap-1.5 px-1 pt-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{data.key}</span>
            <span>•</span>
            <span className="capitalize">{def?.category?.toLowerCase() || data.type}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => deleteNode(id)}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Delete node"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSelectedNodeId(null)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-xs">
        <button
          onClick={() => setActiveTab('parameters')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'parameters'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Parameters</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('last_run')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'last_run'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Last Run</span>
        </button>

        <button
          onClick={() => setActiveTab('docs')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'docs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Docs</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'parameters' && (
          <div>
            {def?.fields && def.fields.length > 0 ? (
              <FormGenerator
                fields={def.fields}
                config={data.config}
                onChange={handleConfigChange}
                nodeId={id}
                credentials={credentials}
                credentialId={data.credentialId}
                onCredentialChange={handleCredentialChange}
              />
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No parameters required for this node.
              </div>
            )}

            {data.type === 'trigger.webhook' && (
              <WebhookConfigDetails workflowId={workflow.id} node={selectedNode} />
            )}

            {data.type === 'trigger.schedule' && (
              <ScheduleConfigDetails
                workflowId={workflow.id}
                cron={(data.config['cron'] as string) || '0 * * * *'}
                timezone={(data.config['timezone'] as string) || 'UTC'}
              />
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4 text-xs">
            {/* Retries */}
            <div className="space-y-1">
              <label className="font-medium text-foreground">Max Retries</label>
              <input
                type="number"
                min={0}
                max={5}
                value={data.settings.retries ?? 0}
                onChange={(e) => handleSettingsChange({ retries: Number(e.target.value) })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 outline-none focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Number of retry attempts if execution fails (0 to 5).
              </p>
            </div>

            {/* Backoff */}
            <div className="space-y-1">
              <label className="font-medium text-foreground">Retry Backoff</label>
              <select
                value={data.settings.backoff ?? 'fixed'}
                onChange={(e) => handleSettingsChange({ backoff: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 outline-none focus:border-primary"
              >
                <option value="fixed">Fixed</option>
                <option value="exponential">Exponential (with jitter)</option>
              </select>
            </div>

            {/* On Error */}
            <div className="space-y-1">
              <label className="font-medium text-foreground">On Error</label>
              <select
                value={data.settings.onError ?? 'stop'}
                onChange={(e) => handleSettingsChange({ onError: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 outline-none focus:border-primary"
              >
                <option value="stop">Stop Workflow</option>
                <option value="continue">Continue (Output empty)</option>
                <option value="route_to_error">Route to Error Port</option>
              </select>
            </div>

            {/* Timeout Ms */}
            <div className="space-y-1">
              <label className="font-medium text-foreground">Timeout (ms)</label>
              <input
                type="number"
                value={data.settings.timeoutMs ?? 30000}
                onChange={(e) => handleSettingsChange({ timeoutMs: Number(e.target.value) })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 outline-none focus:border-primary"
              />
            </div>

            {/* Disabled */}
            <div className="flex items-center justify-between py-2 border-t border-border">
              <div>
                <span className="font-medium text-foreground">Disable Node</span>
                <p className="text-[11px] text-muted-foreground">
                  Skip this node during execution.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(data.settings.disabled)}
                onChange={(e) => handleSettingsChange({ disabled: e.target.checked })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
            </div>
          </div>
        )}

        {activeTab === 'last_run' && (
          <div className="space-y-3 text-xs">
            {latestRun ? (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-2.5">
                  <div className="space-y-0.5">
                    <span className="text-[11px] text-muted-foreground">Status</span>
                    <div className="font-mono font-bold capitalize">{latestRun.status}</div>
                  </div>
                  {latestRun.durationMs !== undefined && latestRun.durationMs !== null && (
                    <div className="flex items-center gap-1 font-mono text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{latestRun.durationMs}ms</span>
                    </div>
                  )}
                </div>

                {latestRun.error ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-destructive">
                    <div className="flex items-center gap-1 font-semibold mb-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Run Error</span>
                    </div>
                    <pre className="font-mono text-[10px] whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(latestRun.error, null, 2)}
                    </pre>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <span className="font-semibold text-foreground">Output:</span>
                  <pre className="max-h-60 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px]">
                    {latestRun.output
                      ? JSON.stringify(latestRun.output, null, 2)
                      : 'No output data'}
                  </pre>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No execution data available. Click "Run" to test this workflow.
              </div>
            )}
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-3 text-xs">
            <div>
              <span className="font-semibold text-foreground">Description</span>
              <p className="mt-1 text-muted-foreground">{def?.description || 'No description'}</p>
            </div>

            <div>
              <span className="font-semibold text-foreground">Ports</span>
              <div className="mt-1 space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  Inputs: {def?.inputs.map((i) => i.label || i.portId).join(', ') || 'None'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Outputs: {def?.outputs.map((o) => o.label || o.portId).join(', ') || 'main'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
