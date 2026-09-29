'use client';

import { useState } from 'react';
import type { VariableRecord } from '@/server/repositories/variables.js';

interface DeleteVariableModalProps {
  isOpen: boolean;
  variable: VariableRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteVariableModal({
  isOpen,
  variable,
  onClose,
  onSuccess,
}: DeleteVariableModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !variable) return null;

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/variables/${variable.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete variable');
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
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground border rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-destructive">Delete Variable</h2>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete variable &quot;{variable.key}&quot;? Workflow expressions
          referencing it may fail.
        </p>

        {error && (
          <div className="p-3 bg-destructive/15 text-destructive rounded-lg text-sm font-medium">
            {error}
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
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
