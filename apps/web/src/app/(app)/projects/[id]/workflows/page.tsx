'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Workflow as WorkflowIcon,
  Plus,
  Copy,
  Trash2,
  Edit2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
} from 'lucide-react';
import {
  CreateWorkflowModal,
  RenameWorkflowModal,
  DeleteWorkflowModal,
  type WorkflowItem,
} from '@/components/workflows/WorkflowModals';

export default function WorkflowsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [workflows, setWorkflows] = React.useState<WorkflowItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [renamingWorkflow, setRenamingWorkflow] = React.useState<WorkflowItem | null>(null);
  const [renaming, setRenaming] = React.useState(false);

  const [deletingWorkflow, setDeletingWorkflow] = React.useState<WorkflowItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null);

  const loadWorkflows = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/workflows`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to load workflows');
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  React.useEffect(() => {
    if (projectId) loadWorkflows();
  }, [projectId, loadWorkflows]);

  const handleCreate = async (name: string, description: string) => {
    try {
      setCreating(true);
      setCreateError(null);
      const res = await fetch(`/api/projects/${projectId}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create workflow');
      setShowCreateModal(false);
      await loadWorkflows();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (newName: string) => {
    if (!renamingWorkflow) return;
    try {
      setRenaming(true);
      const res = await fetch(`/api/workflows/${renamingWorkflow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to rename workflow');
      }
      setRenamingWorkflow(null);
      await loadWorkflows();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRenaming(false);
    }
  };

  const handleDuplicate = async (workflow: WorkflowItem) => {
    try {
      setDuplicatingId(workflow.id);
      const res = await fetch(`/api/workflows/${workflow.id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to duplicate workflow');
      }
      await loadWorkflows();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingWorkflow) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/workflows/${deletingWorkflow.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to delete workflow');
      }
      setDeletingWorkflow(null);
      await loadWorkflows();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build, automate, and orchestrate visual graphs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          <span>New Workflow</span>
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-16 rounded-md border border-border bg-card/50 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={loadWorkflows} className="text-xs font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && workflows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center bg-card/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <WorkflowIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No workflows yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
            Get started by creating your first visual automation workflow.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>Create Workflow</span>
          </button>
        </div>
      )}

      {!loading && !error && workflows.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground font-semibold">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Workflow Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 hidden sm:table-cell">
                    Last Run
                  </th>
                  <th scope="col" className="px-4 py-3 hidden md:table-cell">
                    Updated
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <WorkflowIcon className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <Link
                            href={`/workflows/${wf.id}/editor`}
                            className="hover:underline font-semibold hover:text-primary transition-colors truncate max-w-[200px] sm:max-w-xs block"
                          >
                            {wf.name}
                          </Link>
                          {wf.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-xs">
                              {wf.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${
                          wf.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        {wf.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      {wf.lastExecutionStatus ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          {wf.lastExecutionStatus === 'SUCCESS' && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                          {wf.lastExecutionStatus === 'FAILED' && (
                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                          {wf.lastExecutionStatus === 'RUNNING' && (
                            <Activity className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
                          )}
                          <span className="capitalize">{wf.lastExecutionStatus.toLowerCase()}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Never run</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground hidden md:table-cell">
                      {new Date(wf.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Link
                          href={`/workflows/${wf.id}/editor`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Open Editor"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setRenamingWorkflow(wf)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Rename"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(wf)}
                          disabled={duplicatingId === wf.id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                          title="Duplicate"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingWorkflow(wf)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateWorkflowModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        creating={creating}
        error={createError}
      />

      <RenameWorkflowModal
        workflow={renamingWorkflow}
        onClose={() => setRenamingWorkflow(null)}
        onRename={handleRename}
        renaming={renaming}
      />

      <DeleteWorkflowModal
        workflow={deletingWorkflow}
        onClose={() => setDeletingWorkflow(null)}
        onDelete={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
