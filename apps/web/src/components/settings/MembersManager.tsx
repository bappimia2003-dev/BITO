'use client';

import * as React from 'react';
import { UserPlus, Trash2, AlertCircle } from 'lucide-react';

export interface ProjectMember {
  projectId: string;
  userId: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
}

interface MembersManagerProps {
  projectId: string;
  isOwner: boolean;
  currentUserId?: string;
}

export function MembersManager({ projectId, isOwner, currentUserId }: MembersManagerProps) {
  const [members, setMembers] = React.useState<ProjectMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'editor' | 'viewer'>('editor');
  const [inviting, setInviting] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);

  const loadMembers = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/members`);
      if (!res.ok) throw new Error('Failed to load project members');
      const data = await res.json();
      setMembers(data.members || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      setInviting(true);
      setInviteError(null);
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to add member');
      }
      setInviteEmail('');
      await loadMembers();
    } catch (err) {
      setInviteError((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: 'owner' | 'editor' | 'viewer') => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to change role');
      await loadMembers();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm('Are you sure you want to remove this member from the project?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to remove member');
      await loadMembers();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Team Members</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage who has access to this project and their role permissions.
        </p>
      </div>

      {/* Add member form (Owner only) */}
      {isOwner && (
        <form onSubmit={handleAddMember} className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
            Add New Member
          </h4>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="email"
                required
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="editor">Editor (Can create & edit workflows)</option>
              <option value="viewer">Viewer (Read-only)</option>
            </select>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{inviting ? 'Adding...' : 'Add Member'}</span>
            </button>
          </div>
          {inviteError && <p className="mt-2 text-xs text-destructive">{inviteError}</p>}
        </form>
      )}

      {/* Members list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading members...</div>
        ) : error ? (
          <div className="p-4 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              return (
                <div
                  key={m.userId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs uppercase">
                      {m.email.substring(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{m.email}</span>
                        {isSelf && (
                          <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
                            You
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {isOwner ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          handleRoleChange(
                            m.userId,
                            e.target.value as 'owner' | 'editor' | 'viewer'
                          )
                        }
                        className="rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground shadow-sm"
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="rounded border border-border px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">
                        {m.role}
                      </span>
                    )}

                    {(isOwner || isSelf) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.userId)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                        title={isSelf ? 'Leave Project' : 'Remove Member'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
