'use client';

import { useState } from 'react';
import type { CredentialSummary } from '@/server/repositories/credentials.js';
import { ReauthModal } from '@/components/auth/ReauthModal.js';

interface ReplaceCredentialModalProps {
  isOpen: boolean;
  credential: CredentialSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReplaceCredentialModal({
  isOpen,
  credential,
  onClose,
  onSuccess,
}: ReplaceCredentialModalProps) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReauth, setShowReauth] = useState(false);

  if (!isOpen || !credential) return null;

  const handleFieldChange = (key: string, val: string) => {
    setFields((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payloadData: Record<string, unknown> = { ...fields };
    if (credential.type === 'googleOAuth' && typeof fields.scopes === 'string') {
      payloadData.scopes = fields.scopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    try {
      const res = await fetch(`/api/credentials/${credential.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payloadData }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errPayload = data.error || data;
        if (errPayload.code === 'REAUTH_REQUIRED') {
          setShowReauth(true);
          return;
        }
        throw new Error(errPayload.message || 'Failed to replace credential');
      }

      setFields({});
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
        <div className="bg-card text-card-foreground border rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
          <div className="p-6 border-b flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Replace Secret</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Updating &quot;{credential.name}&quot; ({credential.type}). Existing secret values
                are never pre-filled.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 bg-destructive/15 text-destructive rounded-lg text-sm font-medium">
                {error}
              </div>
            )}

            {credential.type === 'telegramBot' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">New Bot Token</label>
                  <input
                    type="password"
                    required
                    value={fields.botToken || ''}
                    onChange={(e) => handleFieldChange('botToken', e.target.value)}
                    placeholder="Enter new bot token"
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Bot Username (optional)</label>
                  <input
                    type="text"
                    value={fields.botUsername || ''}
                    onChange={(e) => handleFieldChange('botUsername', e.target.value)}
                    placeholder="@my_bot"
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
                  />
                </div>
              </>
            )}

            {credential.type === 'geminiApiKey' && (
              <div>
                <label className="block text-sm font-medium mb-1">New Gemini API Key</label>
                <input
                  type="password"
                  required
                  value={fields.apiKey || ''}
                  onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                  placeholder="Enter new Gemini API key"
                  className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                />
              </div>
            )}

            {credential.type === 'httpBearer' && (
              <div>
                <label className="block text-sm font-medium mb-1">New Bearer Token</label>
                <input
                  type="password"
                  required
                  value={fields.token || ''}
                  onChange={(e) => handleFieldChange('token', e.target.value)}
                  placeholder="Enter new token"
                  className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                />
              </div>
            )}

            {credential.type === 'httpBasic' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={fields.username || ''}
                    onChange={(e) => handleFieldChange('username', e.target.value)}
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    value={fields.password || ''}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
              </>
            )}

            {credential.type === 'httpHeader' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Header Name</label>
                  <input
                    type="text"
                    required
                    value={fields.headerName || ''}
                    onChange={(e) => handleFieldChange('headerName', e.target.value)}
                    placeholder="X-API-Key"
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Header Value</label>
                  <input
                    type="password"
                    required
                    value={fields.headerValue || ''}
                    onChange={(e) => handleFieldChange('headerValue', e.target.value)}
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
              </>
            )}

            <div className="pt-4 flex justify-end gap-3 border-t">
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
                {loading ? 'Encrypting...' : 'Update Secret'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ReauthModal
        isOpen={showReauth}
        actionDescription="Replacing a credential secret requires re-authentication."
        onSuccess={() => setShowReauth(false)}
        onCancel={() => setShowReauth(false)}
      />
    </>
  );
}
