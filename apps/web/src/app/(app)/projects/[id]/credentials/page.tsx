'use client';

import { useState, useEffect, useCallback, use } from 'react';
import type { CredentialSummary } from '@/server/repositories/credentials.js';
import {
  CreateCredentialModal,
  ReplaceCredentialModal,
  DeleteCredentialModal,
} from '@/components/credentials/CredentialModals.js';
import { hasCredentialTester } from '@/server/services/credentialTesters.js';

export default function ProjectCredentialsPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(paramsPromise);

  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedForReplace, setSelectedForReplace] = useState<CredentialSummary | null>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<CredentialSummary | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(
    null
  );

  const fetchCredentials = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/credentials?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.credentials || []);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleTestConnection = async (cred: CredentialSummary) => {
    setTestingId(cred.id);
    setTestResult(null);

    try {
      const res = await fetch(`/api/credentials/${cred.id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult({
        id: cred.id,
        ok: data.ok ?? false,
        message: data.message || (res.ok ? 'Connection successful' : 'Connection failed'),
      });
    } catch (err: unknown) {
      setTestResult({
        id: cred.id,
        ok: false,
        message: err instanceof Error ? err.message : 'Network error during test',
      });
    } finally {
      setTestingId(null);
    }
  };

  const filtered = credentials.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Credentials</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage encrypted API keys, tokens, and OAuth credentials for your project automations.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
        >
          + New Credential
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name or type..."
          className="px-3 py-2 bg-background border rounded-lg text-sm max-w-sm w-full"
        />
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground text-sm">Loading credentials...</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed rounded-xl p-12 text-center space-y-3">
          <p className="text-base font-semibold">No credentials found</p>
          <p className="text-sm text-muted-foreground">
            {search
              ? 'No credentials match your search query.'
              : 'Add your first credential to connect Telegram, Gemini, or third-party APIs.'}
          </p>
          {!search && (
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-2 px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-muted"
            >
              Add Credential
            </button>
          )}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Masked Hint</th>
                  <th className="px-6 py-3">Usage</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((cred) => (
                  <tr key={cred.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-semibold">{cred.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted border">
                        {cred.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                      {cred.hint && Object.keys(cred.hint).length > 0 ? (
                        <div className="space-y-0.5">
                          {Object.entries(cred.hint).map(([k, v]) => (
                            <div key={k}>
                              <span className="opacity-70">{k}:</span> {String(v)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {cred.usedByCount === 1
                        ? '1 workflow node'
                        : `${cred.usedByCount} workflow nodes`}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                      {hasCredentialTester(cred.type) && (
                        <button
                          onClick={() => handleTestConnection(cred)}
                          disabled={testingId === cred.id}
                          className="px-2.5 py-1 text-xs border rounded-md font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {testingId === cred.id ? 'Testing...' : 'Test'}
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedForReplace(cred)}
                        className="px-2.5 py-1 text-xs border rounded-md font-medium hover:bg-muted"
                      >
                        Replace
                      </button>
                      <button
                        onClick={() => setSelectedForDelete(cred)}
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

      {/* Test Result Toast/Banner */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex justify-between items-center ${
            testResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          <div className="text-sm font-medium">
            <span className="font-bold">{testResult.ok ? 'Success: ' : 'Failed: '}</span>
            {testResult.message}
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="text-xs font-semibold px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
          >
            Dismiss
          </button>
        </div>
      )}

      <CreateCredentialModal
        isOpen={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
        onSuccess={fetchCredentials}
      />

      <ReplaceCredentialModal
        isOpen={!!selectedForReplace}
        credential={selectedForReplace}
        onClose={() => setSelectedForReplace(null)}
        onSuccess={fetchCredentials}
      />

      <DeleteCredentialModal
        isOpen={!!selectedForDelete}
        credential={selectedForDelete}
        onClose={() => setSelectedForDelete(null)}
        onSuccess={fetchCredentials}
      />
    </div>
  );
}
