'use client';

import * as React from 'react';

export interface WorkflowItem {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  revision: number;
  updatedAt: string;
  lastExecutionStatus?: string | null;
}

export function CreateWorkflowModal({
  isOpen,
  onClose,
  onSubmit,
  creating,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
  creating: boolean;
  error: string | null;
}) {
  const [name, setName] = React.useState('');
  const [desc, setDesc] = React.useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Create Workflow</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Give your new automation workflow a name and description.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSubmit(name.trim(), desc.trim());
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <label htmlFor="modalWfName" className="block text-xs font-medium text-foreground mb-1">
              Name
            </label>
            <input
              id="modalWfName"
              type="text"
              required
              autoFocus
              placeholder="e.g. Telegram Support Bot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="modalWfDesc" className="block text-xs font-medium text-foreground mb-1">
              Description (optional)
            </label>
            <textarea
              id="modalWfDesc"
              rows={2}
              placeholder="Briefly describe what this workflow accomplishes..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RenameWorkflowModal({
  workflow,
  onClose,
  onRename,
  renaming,
}: {
  workflow: WorkflowItem | null;
  onClose: () => void;
  onRename: (newName: string) => Promise<void>;
  renaming: boolean;
}) {
  const [name, setName] = React.useState(workflow?.name || '');

  React.useEffect(() => {
    if (workflow) setName(workflow.name);
  }, [workflow]);

  if (!workflow) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Rename Workflow</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRename(name.trim());
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <label
              htmlFor="renameWfInput"
              className="block text-xs font-medium text-foreground mb-1"
            >
              New Name
            </label>
            <input
              id="renameWfInput"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={renaming}
              className="rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={renaming || !name.trim()}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {renaming ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteWorkflowModal({
  workflow,
  onClose,
  onDelete,
  deleting,
}: {
  workflow: WorkflowItem | null;
  onClose: () => void;
  onDelete: () => Promise<void>;
  deleting: boolean;
}) {
  const [confirmText, setConfirmText] = React.useState('');

  if (!workflow) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-destructive">Delete Workflow</h2>
        <p className="text-xs text-muted-foreground mt-2">
          Are you sure you want to delete{' '}
          <strong className="text-foreground font-semibold">{workflow.name}</strong>? This action
          cannot be undone.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Type <span className="font-mono font-semibold text-foreground">{workflow.name}</span> to
          confirm:
        </p>
        <input
          type="text"
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={workflow.name}
          className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || confirmText !== workflow.name}
            className="rounded-md bg-destructive px-3.5 py-2 text-xs font-medium text-destructive-foreground shadow hover:bg-destructive/90 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}
