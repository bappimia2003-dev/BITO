'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ShieldAlert, AlertCircle, Save } from 'lucide-react';
import { MembersManager } from '@/components/settings/MembersManager';
import { AuditLogViewer } from '@/components/settings/AuditLogViewer';
import { ReauthModal } from '@/components/auth/ReauthModal';

interface ProjectData {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  role?: 'owner' | 'editor' | 'viewer';
}

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = React.useState<ProjectData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Rename state
  const [projectName, setProjectName] = React.useState('');
  const [savingName, setSavingName] = React.useState(false);
  const [nameSuccess, setNameSuccess] = React.useState(false);

  // Danger zone state
  const [deleteConfirmText, setDeleteConfirmText] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [showReauthModal, setShowReauthModal] = React.useState(false);

  const loadProject = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to load project');
      const data = await res.json();
      setProject(data.project);
      setProjectName(data.project.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  React.useEffect(() => {
    if (projectId) loadProject();
  }, [projectId, loadProject]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !project) return;

    try {
      setSavingName(true);
      setNameSuccess(false);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update project');
      setProject(data.project);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const executeDeleteProject = async () => {
    if (!project) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (res.status === 401) {
        const data = await res.json();
        if (data.error?.code === 'REAUTH_REQUIRED') {
          setShowReauthModal(true);
          return;
        }
        router.push('/login');
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to delete project');
      }

      router.push('/projects');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const isOwner = project?.role === 'owner';
  const isEditor = isOwner || project?.role === 'editor';

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        Loading project settings...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center gap-2">
        <AlertCircle className="h-5 w-5" />
        <span>{error || 'Project not found'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Project Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure settings, team members, and view audit events for{' '}
          <strong className="text-foreground">{project.name}</strong>.
        </p>
      </div>

      {/* 1. General Settings */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">General Settings</h2>
        <form onSubmit={handleRename} className="mt-4 space-y-4 max-w-md">
          <div>
            <label
              htmlFor="projNameInput"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Project Name
            </label>
            <input
              id="projNameInput"
              type="text"
              required
              disabled={!isEditor || savingName}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {isEditor && (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingName || !projectName.trim() || projectName === project.name}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{savingName ? 'Saving...' : 'Save Changes'}</span>
              </button>
              {nameSuccess && <span className="text-xs text-emerald-600 font-medium">Saved!</span>}
            </div>
          )}
        </form>
      </section>

      {/* 2. Team Members */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <MembersManager projectId={projectId} isOwner={isOwner} />
      </section>

      {/* 3. Audit Log (Owner Only) */}
      {isOwner && (
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <AuditLogViewer projectId={projectId} />
        </section>
      )}

      {/* 4. Danger Zone (Owner Only) */}
      {isOwner && (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <h2 className="text-base font-semibold">Danger Zone</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Permanently delete this project and all associated workflows, executions, credentials,
            and assets.
          </p>

          <div className="mt-4 max-w-md space-y-3">
            <p className="text-xs text-muted-foreground">
              To confirm deletion, please type{' '}
              <strong className="text-foreground font-mono">{project.name}</strong>:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={project.name}
              className="w-full rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-destructive focus:outline-none focus:ring-1 focus:ring-destructive"
            />
            <button
              type="button"
              onClick={executeDeleteProject}
              disabled={deleting || deleteConfirmText !== project.name}
              className="rounded-md bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground shadow hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Project Permanently'}
            </button>
          </div>
        </section>
      )}

      {/* Re-auth Modal if step-up authentication is needed */}
      <ReauthModal
        isOpen={showReauthModal}
        onSuccess={() => {
          setShowReauthModal(false);
          executeDeleteProject();
        }}
        onCancel={() => setShowReauthModal(false)}
        actionDescription="delete this project"
      />
    </div>
  );
}
