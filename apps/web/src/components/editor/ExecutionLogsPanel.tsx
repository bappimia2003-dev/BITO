'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Terminal,
  Activity,
  ListTree,
  FileJson,
  XCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { useEditor } from './EditorContext.js';

type Tab = 'timeline' | 'logs' | 'executions' | 'data';

interface LogItem {
  id: string;
  level: string;
  kind: string;
  message: string;
  data?: unknown;
  ts: string;
}

export function ExecutionLogsPanel() {
  const { workflow, activeExecution, cancelExecution, setSelectedNodeId } = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [pastExecutions, setPastExecutions] = useState<
    Array<{ id: string; status: string; mode: string; createdAt: string; nodeRunCount: number }>
  >([]);

  // Automatically open panel when activeExecution starts running
  useEffect(() => {
    if (activeExecution) {
      setIsOpen(true);
    }
  }, [activeExecution?.id]);

  // Fetch logs when activeExecution changes or poll logs
  useEffect(() => {
    if (!activeExecution || !isOpen) return;

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/executions/${activeExecution.id}/logs`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch {
        // Ignored
      }
    };

    void fetchLogs();
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, [activeExecution?.id, isOpen]);

  // Fetch past executions when tab is executions
  useEffect(() => {
    if (activeTab === 'executions' && isOpen) {
      void fetch(`/api/projects/${workflow.projectId}/executions?workflowId=${workflow.id}`)
        .then((res) => res.json())
        .then((data) => setPastExecutions(data.executions || []))
        .catch(() => {});
    }
  }, [activeTab, isOpen, workflow.id, workflow.projectId]);

  const filteredLogs = logs.filter((l) => logFilter === 'all' || l.level === logFilter);

  return (
    <div className="flex flex-col border-t border-border bg-card text-card-foreground select-none z-20">
      {/* Collapsed Bar / Header */}
      <div className="flex h-9 items-center justify-between px-4 bg-muted/40 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 font-semibold text-foreground hover:text-primary transition-colors"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Execution Logs</span>
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>

          {activeExecution && (
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                  activeExecution.status === 'SUCCESS'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : activeExecution.status === 'FAILED'
                      ? 'bg-destructive/15 text-destructive'
                      : activeExecution.status === 'RUNNING'
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 animate-pulse'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {activeExecution.status}
              </span>
              <span className="text-muted-foreground">ID: {activeExecution.id.slice(0, 8)}...</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {activeExecution &&
            (activeExecution.status === 'RUNNING' || activeExecution.status === 'WAITING') && (
              <button
                onClick={cancelExecution}
                className="flex items-center gap-1 rounded bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/25 transition-colors"
              >
                <XCircle className="h-3 w-3" />
                <span>Cancel</span>
              </button>
            )}
        </div>
      </div>

      {/* Expanded Panel */}
      {isOpen && (
        <div className="flex h-64 flex-col border-t border-border">
          {/* Tabs Bar */}
          <div className="flex items-center justify-between border-b border-border px-3 text-xs">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'timeline'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Node Timeline</span>
              </button>

              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'logs'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>Logs ({logs.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('data')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'data'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileJson className="h-3.5 w-3.5" />
                <span>Data Inspector</span>
              </button>

              <button
                onClick={() => setActiveTab('executions')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'executions'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <ListTree className="h-3.5 w-3.5" />
                <span>History</span>
              </button>
            </div>

            {/* Filter for logs */}
            {activeTab === 'logs' && (
              <div className="flex items-center gap-1">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <select
                  value={logFilter}
                  onChange={(e) =>
                    setLogFilter(e.target.value as 'all' | 'error' | 'warn' | 'info')
                  }
                  className="rounded border border-border bg-background px-2 py-0.5 text-[11px] outline-none"
                >
                  <option value="all">All levels</option>
                  <option value="error">Errors only</option>
                  <option value="warn">Warnings</option>
                  <option value="info">Info</option>
                </select>
              </div>
            )}
          </div>

          {/* Tab Panes */}
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            {activeTab === 'timeline' && (
              <div className="space-y-2">
                {activeExecution?.nodeRuns && activeExecution.nodeRuns.length > 0 ? (
                  activeExecution.nodeRuns.map((run) => (
                    <div
                      key={run.id}
                      onClick={() => setSelectedNodeId(run.nodeId)}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background/50 p-2 hover:border-primary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {run.status === 'SUCCESS' && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        )}
                        {run.status === 'FAILED' && (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                        {run.status === 'RUNNING' && (
                          <Clock className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        <span className="font-semibold text-foreground">{run.nodeKey}</span>
                        <span className="text-[11px] text-muted-foreground">
                          (attempt {run.attempt})
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        {run.durationMs !== undefined && run.durationMs !== null && (
                          <span>{run.durationMs}ms</span>
                        )}
                        <span className="uppercase font-bold text-[10px]">{run.status}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No active node run timeline. Execute a test run to inspect steps.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-1">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-2 py-0.5 text-[11px] hover:bg-muted/40 px-1 rounded"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {new Date(log.ts).toLocaleTimeString()}
                      </span>
                      <span
                        className={`font-bold shrink-0 uppercase text-[10px] px-1 rounded ${
                          log.level === 'error'
                            ? 'text-destructive bg-destructive/10'
                            : log.level === 'warn'
                              ? 'text-amber-500 bg-amber-500/10'
                              : 'text-blue-500 bg-blue-500/10'
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="text-muted-foreground shrink-0">[{log.kind}]</span>
                      <span className="text-foreground">{log.message}</span>
                      {log.data ? (
                        <span className="text-muted-foreground text-[10px] truncate max-w-xs">
                          {JSON.stringify(log.data)}
                        </span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No logs recorded.</div>
                )}
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-3">
                <div>
                  <span className="font-bold text-foreground">Trigger Payload:</span>
                  <pre className="mt-1 max-h-40 overflow-y-auto rounded border border-border bg-background p-2 text-[11px]">
                    {activeExecution
                      ? JSON.stringify(activeExecution, null, 2)
                      : 'No execution data'}
                  </pre>
                </div>
              </div>
            )}

            {activeTab === 'executions' && (
              <div className="space-y-1.5">
                {pastExecutions.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded border border-border bg-background p-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{e.id.slice(0, 8)}...</span>
                      <span className="text-muted-foreground">({e.mode})</span>
                      <span className="text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                        e.status === 'SUCCESS'
                          ? 'text-emerald-500 bg-emerald-500/10'
                          : e.status === 'FAILED'
                            ? 'text-destructive bg-destructive/10'
                            : 'text-muted-foreground bg-muted'
                      }`}
                    >
                      {e.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
