'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Activity,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Terminal,
  FileJson,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface NodeRunItem {
  id: string;
  nodeId: string;
  nodeKey: string;
  status: 'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'SKIPPED';
  attempt: number;
  inputPort: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  durationMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

interface ExecutionData {
  id: string;
  workflowId: string;
  projectId: string;
  status: 'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  mode: string;
  triggerPayload?: unknown;
  vars: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const execId = params.execId as string;

  const [execution, setExecution] = useState<ExecutionData | null>(null);
  const [nodeRuns, setNodeRuns] = useState<NodeRunItem[]>([]);
  const [selectedNodeRunId, setSelectedNodeRunId] = useState<string | null>(null);
  const [logs, setLogs] = useState<
    Array<{ id: string; level: string; kind: string; message: string; ts: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'io' | 'logs' | 'vars'>('io');

  const loadExecution = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/executions/${execId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to load execution details');
      const data = await res.json();
      setExecution(data.execution);
      setNodeRuns(data.nodeRuns || []);
      if (data.nodeRuns?.length > 0 && !selectedNodeRunId) {
        setSelectedNodeRunId(data.nodeRuns[0].id);
      }

      // Load logs
      const logRes = await fetch(`/api/executions/${execId}/logs`);
      if (logRes.ok) {
        const logData = await logRes.json();
        setLogs(logData.logs || []);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [execId, router, selectedNodeRunId]);

  useEffect(() => {
    void loadExecution();
  }, [loadExecution]);

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/executions/${execId}/cancel`, { method: 'POST' });
      await loadExecution();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/executions/${execId}/retry`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        router.push(`/projects/${projectId}/executions/${data.executionId}`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !execution) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
        <h2 className="text-base font-semibold">Execution not found</h2>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
        <Link
          href={`/projects/${projectId}/executions`}
          className="mt-4 inline-block text-xs text-primary underline"
        >
          Back to Executions
        </Link>
      </div>
    );
  }

  const selectedRun = nodeRuns.find((r) => r.id === selectedNodeRunId) || nodeRuns[0];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Top Header */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6 select-none shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}/executions`}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">
                Execution {execution.id.slice(0, 8)}...
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  execution.status === 'SUCCESS'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : execution.status === 'FAILED'
                      ? 'bg-destructive/10 text-destructive'
                      : execution.status === 'RUNNING'
                        ? 'bg-blue-500/10 text-blue-600 animate-pulse'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {execution.status}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Started {new Date(execution.createdAt).toLocaleString()} • Mode: {execution.mode}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/workflows/${execution.workflowId}/editor`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open in Editor</span>
          </Link>

          {(execution.status === 'RUNNING' || execution.status === 'WAITING') && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </button>
          )}

          {(execution.status === 'FAILED' || execution.status === 'CANCELLED') && (
            <button
              onClick={handleRetry}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry Execution</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Body: 2 Columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Node Runs Timeline */}
        <aside className="w-72 md:w-80 border-r border-border bg-card/60 overflow-y-auto p-4 space-y-2 select-none shrink-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Node Runs ({nodeRuns.length})
          </div>

          {nodeRuns.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedNodeRunId(run.id)}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-xs transition-colors ${
                run.id === selectedRun?.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card hover:bg-muted/50'
              }`}
            >
              <div className="space-y-0.5 truncate pr-2">
                <div className="font-semibold text-foreground truncate">{run.nodeKey}</div>
                <div className="text-[10px] text-muted-foreground">
                  Attempt {run.attempt} • Port: {run.inputPort}
                </div>
              </div>

              <div className="flex items-center gap-1 font-mono text-[10px]">
                {run.durationMs !== undefined && run.durationMs !== null && (
                  <span className="text-muted-foreground">{run.durationMs}ms</span>
                )}
                {run.status === 'SUCCESS' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
                {run.status === 'FAILED' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
              </div>
            </div>
          ))}
        </aside>

        {/* Right Column: Node Details & Inspector */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Tab Navigation */}
          <div className="flex border-b border-border bg-card px-4 text-xs font-medium">
            <button
              onClick={() => setActiveTab('io')}
              className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-colors ${
                activeTab === 'io'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileJson className="h-4 w-4" />
              <span>Input & Output</span>
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>Logs ({logs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('vars')}
              className={`flex items-center gap-1.5 py-3 px-3 border-b-2 transition-colors ${
                activeTab === 'vars'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>Execution Vars</span>
            </button>
          </div>

          {/* Tab Panes */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'io' && selectedRun && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Node Input
                  </span>
                  <pre className="max-h-96 overflow-y-auto rounded-lg border border-border bg-card p-4 font-mono text-xs">
                    {selectedRun.input ? JSON.stringify(selectedRun.input, null, 2) : 'None'}
                  </pre>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Node Output
                  </span>
                  <pre className="max-h-96 overflow-y-auto rounded-lg border border-border bg-card p-4 font-mono text-xs">
                    {selectedRun.output ? JSON.stringify(selectedRun.output, null, 2) : 'None'}
                  </pre>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-1 font-mono text-xs">
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-start gap-2 py-1 px-2 rounded hover:bg-muted/40"
                  >
                    <span className="text-muted-foreground">
                      {new Date(l.ts).toLocaleTimeString()}
                    </span>
                    <span className="font-bold uppercase text-[10px] px-1 rounded bg-muted">
                      {l.level}
                    </span>
                    <span className="text-foreground">{l.message}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'vars' && (
              <div className="space-y-2 font-mono text-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Variables
                </span>
                <pre className="max-h-96 overflow-y-auto rounded-lg border border-border bg-card p-4">
                  {JSON.stringify(execution.vars, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
