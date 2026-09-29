'use client';

import { useState, useEffect, useCallback, use } from 'react';
import type { VariableRecord } from '@/server/repositories/variables.js';
import {
  CreateVariableModal,
  EditVariableModal,
  DeleteVariableModal,
} from '@/components/variables/VariableModals.js';

interface WorkflowOption {
  id: string;
  name: string;
}

export default function ProjectVariablesPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(paramsPromise);

  const [scope, setScope] = useState<'project' | 'workflow' | 'global'>('project');
  const [variables, setVariables] = useState<VariableRecord[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedForEdit, setSelectedForEdit] = useState<VariableRecord | null>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<VariableRecord | null>(null);

  // Fetch workflows in this project for workflow scope selection
  useEffect(() => {
    async function loadWorkflows() {
      try {
        const res = await fetch(`/api/projects/${projectId}/workflows`);
        if (res.ok) {
          const data = await res.json();
          setWorkflows(data.workflows || []);
          if (data.workflows?.length > 0 && !selectedWorkflowId) {
            setSelectedWorkflowId(data.workflows[0].id);
          }
        }
      } catch {
        // Ignore workflow fetch errors
      }
    }
    loadWorkflows();
  }, [projectId, selectedWorkflowId]);

  const fetchVariables = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/variables?scope=${scope}`;
      if (scope === 'project') {
        url += `&projectId=${projectId}`;
      } else if (scope === 'workflow') {
        if (!selectedWorkflowId) {
          setVariables([]);
          setLoading(false);
          return;
        }
        url += `&workflowId=${selectedWorkflowId}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setVariables(data.variables || []);
      }
    } finally {
      setLoading(false);
    }
  }, [scope, projectId, selectedWorkflowId]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  const filtered = variables.filter((v) => v.key.toLowerCase().includes(search.toLowerCase()));

  const formatValuePreview = (val: unknown) => {
    if (typeof val === 'object' && val !== null) {
      return (
        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded truncate max-w-xs block">
          {JSON.stringify(val)}
        </code>
      );
    }
    return <span className="font-mono text-xs">{String(val)}</span>;
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Variables</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Environment and execution variables accessible in workflow expressions via{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">vars.*</code>.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
        >
          + Add Variable
        </button>
      </div>

      {/* Scope Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <button
          onClick={() => setScope('project')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            scope === 'project'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Project Scope
        </button>
        <button
          onClick={() => setScope('workflow')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            scope === 'workflow'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Workflow Scope
        </button>
        <button
          onClick={() => setScope('global')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            scope === 'global'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Global Scope (User)
        </button>
      </div>

      {/* Workflow Scope Selector */}
      {scope === 'workflow' && (
        <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-lg border">
          <label className="text-sm font-medium">Select Workflow:</label>
          {workflows.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No workflows created in this project.
            </span>
          ) : (
            <select
              value={selectedWorkflowId}
              onChange={(e) => setSelectedWorkflowId(e.target.value)}
              className="px-3 py-1.5 bg-background border rounded-lg text-sm"
            >
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Search Input */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by variable key..."
          className="px-3 py-2 bg-background border rounded-lg text-sm max-w-sm w-full"
        />
      </div>

      {/* Variables Table */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground text-sm">Loading variables...</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed rounded-xl p-12 text-center space-y-3">
          <p className="text-base font-semibold">No {scope} variables found</p>
          <p className="text-sm text-muted-foreground">
            {search
              ? 'No variables match your search.'
              : `Create your first ${scope} variable to reuse constants or configuration across workflows.`}
          </p>
          {!search && (
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-2 px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-muted"
            >
              Add Variable
            </button>
          )}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3">Key</th>
                  <th className="px-6 py-3">Value</th>
                  <th className="px-6 py-3">Last Updated</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-mono font-semibold text-primary">{v.key}</td>
                    <td className="px-6 py-4 max-w-md">{formatValuePreview(v.value)}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {new Date(v.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedForEdit(v)}
                        className="px-2.5 py-1 text-xs border rounded-md font-medium hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setSelectedForDelete(v)}
                        className="px-2.5 py-1 text-xs border border-destructive/30 text-destructive rounded-md font-medium hover:bg-destructive/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateVariableModal
        isOpen={createOpen}
        scope={scope}
        projectId={projectId}
        workflows={workflows}
        onClose={() => setCreateOpen(false)}
        onSuccess={fetchVariables}
      />

      <EditVariableModal
        isOpen={!!selectedForEdit}
        variable={selectedForEdit}
        onClose={() => setSelectedForEdit(null)}
        onSuccess={fetchVariables}
      />

      <DeleteVariableModal
        isOpen={!!selectedForDelete}
        variable={selectedForDelete}
        onClose={() => setSelectedForDelete(null)}
        onSuccess={fetchVariables}
      />
    </div>
  );
}
