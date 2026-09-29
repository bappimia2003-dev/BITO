'use client';

import * as React from 'react';
import { History, RefreshCw, AlertCircle } from 'lucide-react';

interface AuditLog {
  id: string;
  userId: string | null;
  projectId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogViewerProps {
  projectId: string;
}

export function AuditLogViewer({ projectId }: AuditLogViewerProps) {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const fetchLogs = React.useCallback(
    async (cursor?: string) => {
      try {
        if (!cursor) setLoading(true);
        else setLoadingMore(true);
        setError(null);

        const url = `/api/projects/${projectId}/audit?limit=25${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || 'Failed to load audit logs');
        }
        const data = await res.json();

        if (cursor) {
          setLogs((prev) => [...prev, ...(data.logs || [])]);
        } else {
          setLogs(data.logs || []);
        }
        setNextCursor(data.nextCursor);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [projectId]
  );

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Audit Log</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Immutable log of administrative and workflow operations in this project.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchLogs()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-12 rounded-md border border-border bg-card/50 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchLogs()}
            className="text-xs font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center bg-card/20">
          <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No audit entries recorded yet.</p>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Target</th>
                  <th className="px-4 py-3 hidden md:table-cell">IP Address</th>
                  <th className="px-4 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                      {log.targetType ? `${log.targetType}:${log.targetId?.substring(0, 8)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                      {log.ip || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">
                      {Object.keys(log.meta).length > 0 ? JSON.stringify(log.meta) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <div className="border-t border-border p-3 text-center bg-card">
              <button
                type="button"
                onClick={() => fetchLogs(nextCursor)}
                disabled={loadingMore}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {loadingMore ? 'Loading more logs...' : 'Load older logs'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
