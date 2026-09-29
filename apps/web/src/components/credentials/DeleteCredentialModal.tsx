'use client';

import { useState } from 'react';
import type { CredentialSummary, CredentialDependency } from '@/server/repositories/credentials.js';
import { ReauthModal } from '@/components/auth/ReauthModal.js';

interface DeleteCredentialModalProps {
  isOpen: boolean;
  credential: CredentialSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteCredentialModal({
  isOpen,
  credential,
  onClose,
  onSuccess,
}: DeleteCredentialModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dependents, setDependents] = useState<CredentialDependency[]>([]);
  const [showReauth, setShowReauth] = useState(false);

  if (!isOpen || !credential) return null;

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    setDependents([]);

    try {
      const res = await fetch(`/api/credentials/${credential.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        const errPayload = data.error || data;
        if (errPayload.code === 'REAUTH_REQUIRED') {
          setShowReauth(true);
          return;
        }
        if (errPayload.code === 'CREDENTIAL_IN_USE' && errPayload.details?.dependents) {
          setDependents(errPayload.details.dependents as CredentialDependency[]);
          throw new Error(errPayload.message || 'Credential is in use');
        }
        throw new Error(errPayload.message || 'Failed to delete credential');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card text-card-foreground border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-destructive">Delete Credential</h2>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{credential.name}&quot;? This action cannot be
            undone.
          </p>

          {error && (
            <div className="p-3 bg-destructive/15 text-destructive rounded-lg text-sm font-medium space-y-2">
              <p>{error}</p>
              {dependents.length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="font-bold">Used by workflows:</p>
                  <ul className="list-disc list-inside">
                    {dependents.map((d) => (
                      <li key={d.nodeId}>
                        {d.workflowName} ({d.nodeKey} - {d.nodeType})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 bg-destructive text-destructive-foreground font-medium rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Deleting...' : 'Delete Credential'}
            </button>
          </div>
        </div>
      </div>

      <ReauthModal
        isOpen={showReauth}
        actionDescription="Deleting a credential requires re-authentication."
        onSuccess={() => setShowReauth(false)}
        onCancel={() => setShowReauth(false)}
      />
    </>
  );
}
