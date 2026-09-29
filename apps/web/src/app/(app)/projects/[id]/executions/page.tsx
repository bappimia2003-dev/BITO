'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface ExecutionItem {
  id: string;
  workflowId: string;
  projectId: string;
  status: 'QUEUED' | 'RUNNING' | 'WAITING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  mode: string;
  nodeRunCount: number;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: Record<string, unknown> | null;
}

interface WorkflowBrief {
  id: string;
  name: string;
}

export default function ProjectExecutionsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [workflows, setWorkflows] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [workflowFilter, setWorkflowFilter] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch workflows map
      const wfRes = await fetch(`/api/projects/${projectId}/workflows`);
      if (wfRes.status === 401) {
        router.push('/login');
        return;
      }
      if (wfRes.ok) {
        const wfData = await wfRes.json();
        const map: Record<string, string> = {};
        for (const w of (wfData.workflows || []) as WorkflowBrief[]) {
          map[w.id] = w.name;
        }
        setWorkflows(map);
      }

      // Fetch executions
      let url = `/api/projects/${projectId}/executions?limit=50`;
      if (statusFilter !== 'ALL') url += `&status=${statusFilter}`;
      if (workflowFilter !== 'ALL') url += `&workflowId=${workflowFilter}`;

      const execRes = await fetch(url);
      if (!execRes.ok) throw new Error('Failed to load executions');
      const execData = await execRes.json();
      setExecutions(execData.executions || []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, router, statusFilter, workflowFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const getStatusBadge = (status: ExecutionItem['status']) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            <span>Success</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive border border-destructive/20">
            <XCircle className="h-3 w-3" />
            <span>Failed</span>
          </span>
        );
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20 animate-pulse">
            <Clock className="h-3 w-3" />
            <span>Running</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground border border-border">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Executions</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor workflow execution runs, status, and performance.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 p-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span>Filters:</span>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-xs outline-none focus:border-primary"
        >
          <option value="ALL">All Statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="RUNNING">Running</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {/* Workflow Filter */}
        <select
          value={workflowFilter}
          onChange={(e) => setWorkflowFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-xs outline-none focus:border-primary max-w-xs truncate"
        >
          <option value="ALL">All Workflows</option>
          {Object.entries(workflows).map(([wId, wName]) => (
            <option key={wId} value={wId}>
              {wName}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <button onClick={loadData} className="font-semibold underline">
            Retry
          </button>
        </div>
      ) : executions.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center bg-card/30">
          <Activity className="h-8 w-8 text-muted-foreground mb-3" />
          <h3 className="text-sm font-semibold text-foreground">No executions found</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Trigger a workflow from the editor to see execution logs here.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Execution ID</th>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Steps</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3 text-right">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {executions.map((exec) => (
                <tr
                  key={exec.id}
                  onClick={() => router.push(`/projects/${projectId}/executions/${exec.id}`)}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">{getStatusBadge(exec.status)}</td>
                  <td className="px-4 py-3 font-mono font-medium text-foreground">
                    {exec.id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground truncate max-w-[180px]">
                    {workflows[exec.workflowId] || 'Workflow'}
                  </td>
                  <td className="px-4 py-3 uppercase font-mono text-[10px] text-muted-foreground">
                    {exec.mode}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    {exec.nodeRunCount} nodes
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(exec.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
