'use client';

import { useState, useEffect } from 'react';

interface CreateVariableModalProps {
  isOpen: boolean;
  scope: 'global' | 'project' | 'workflow';
  projectId: string;
  workflows: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateVariableModal({
  isOpen,
  scope,
  projectId,
  workflows,
  onClose,
  onSuccess,
}: CreateVariableModalProps) {
  const [key, setKey] = useState('');
  const [valueStr, setValueStr] = useState('');
  const [valueType, setValueType] = useState<'string' | 'number' | 'boolean' | 'json'>('string');
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workflows.length > 0 && !workflowId) {
      setWorkflowId(workflows[0]!.id);
    }
  }, [workflows, workflowId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let parsedValue: unknown;
    try {
      if (valueType === 'number') {
        parsedValue = Number(valueStr);
        if (isNaN(parsedValue as number)) throw new Error('Value must be a valid number');
      } else if (valueType === 'boolean') {
        parsedValue = valueStr === 'true';
      } else if (valueType === 'json') {
        parsedValue = JSON.parse(valueStr || '{}');
      } else {
        parsedValue = valueStr;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid value format');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          key: key.trim(),
          value: parsedValue,
          projectId: scope === 'project' ? projectId : undefined,
          workflowId: scope === 'workflow' ? workflowId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create variable');
      }

      setKey('');
      setValueStr('');
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
          <h2 className="text-xl font-bold tracking-tight">
            Add {scope.charAt(0).toUpperCase() + scope.slice(1)} Variable
          </h2>
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

          {scope === 'workflow' && (
            <div>
              <label className="block text-sm font-medium mb-1">Target Workflow</label>
              <select
                value={workflowId}
                onChange={(e) => setWorkflowId(e.target.value)}
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              >
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Key Name</label>
            <input
              type="text"
              required
              pattern="^[A-Za-z_][A-Za-z0-9_]*$"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. API_ENDPOINT or retry_count"
              className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must start with a letter or underscore, alphanumeric only.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Value Type</label>
            <select
              value={valueType}
              onChange={(e) => setValueType(e.target.value as typeof valueType)}
              className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="json">JSON Object / Array</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Value</label>
            {valueType === 'boolean' ? (
              <select
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : valueType === 'json' ? (
              <textarea
                rows={4}
                required
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                placeholder='{"key": "value"}'
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
              />
            ) : (
              <input
                type={valueType === 'number' ? 'number' : 'text'}
                required
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                placeholder="Enter variable value"
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            )}
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
              {loading ? 'Saving...' : 'Save Variable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
