'use client';

import { useState, useEffect } from 'react';
import type { VariableRecord } from '@/server/repositories/variables.js';

interface EditVariableModalProps {
  isOpen: boolean;
  variable: VariableRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditVariableModal({
  isOpen,
  variable,
  onClose,
  onSuccess,
}: EditVariableModalProps) {
  const [valueStr, setValueStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (variable) {
      if (typeof variable.value === 'object' && variable.value !== null) {
        setValueStr(JSON.stringify(variable.value, null, 2));
      } else {
        setValueStr(String(variable.value ?? ''));
      }
    }
  }, [variable]);

  if (!isOpen || !variable) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let parsedValue: unknown = valueStr;
    try {
      parsedValue = JSON.parse(valueStr);
    } catch {
      if (valueStr === 'true') parsedValue = true;
      else if (valueStr === 'false') parsedValue = false;
      else if (!isNaN(Number(valueStr)) && valueStr.trim() !== '') parsedValue = Number(valueStr);
      else parsedValue = valueStr;
    }

    try {
      const res = await fetch(`/api/variables/${variable.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: parsedValue }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update variable');
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
      <div className="bg-card text-card-foreground border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-xl font-bold tracking-tight">Edit Variable: {variable.key}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/15 text-destructive rounded-lg text-sm font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Value (Text or JSON)</label>
            <textarea
              rows={6}
              required
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Value'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
