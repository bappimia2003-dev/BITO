'use client';

import { useState } from 'react';
import { CREDENTIAL_TYPES, type CredentialType } from '@/server/repositories/credentialSchemas.js';
import { ReauthModal } from '@/components/auth/ReauthModal.js';

const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  telegramBot: 'Telegram Bot',
  geminiApiKey: 'Google Gemini API Key',
  whatsappCloud: 'WhatsApp Cloud API',
  metaPage: 'Meta / Facebook Page',
  googleOAuth: 'Google OAuth 2.0',
  httpBearer: 'HTTP Bearer Token',
  httpBasic: 'HTTP Basic Auth',
  httpHeader: 'HTTP Header Auth',
};

interface CreateCredentialModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateCredentialModal({
  isOpen,
  projectId,
  onClose,
  onSuccess,
}: CreateCredentialModalProps) {
  const [type, setType] = useState<CredentialType>('telegramBot');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReauth, setShowReauth] = useState(false);

  if (!isOpen) return null;

  const handleFieldChange = (key: string, val: string) => {
    setFields((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payloadData: Record<string, unknown> = { ...fields };
    if (type === 'googleOAuth' && typeof fields.scopes === 'string') {
      payloadData.scopes = fields.scopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: name.trim(),
          type,
          data: payloadData,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errPayload = data.error || data;
        if (errPayload.code === 'REAUTH_REQUIRED') {
          setShowReauth(true);
          return;
        }
        throw new Error(errPayload.message || 'Failed to create credential');
      }

      setName('');
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
            <h2 className="text-xl font-bold tracking-tight">Create New Credential</h2>
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

            <div>
              <label className="block text-sm font-medium mb-1">Credential Type</label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as CredentialType);
                  setFields({});
                }}
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              >
                {CREDENTIAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CREDENTIAL_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Credential Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production Telegram Bot"
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>

            {type === 'telegramBot' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Bot Token</label>
                  <input
                    type="password"
                    required
                    value={fields.botToken || ''}
                    onChange={(e) => handleFieldChange('botToken', e.target.value)}
                    placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
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

            {type === 'geminiApiKey' && (
              <div>
                <label className="block text-sm font-medium mb-1">Gemini API Key</label>
                <input
                  type="password"
                  required
                  value={fields.apiKey || ''}
                  onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                />
              </div>
            )}

            {type === 'whatsappCloud' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone Number ID</label>
                  <input
                    type="text"
                    required
                    value={fields.phoneNumberId || ''}
                    onChange={(e) => handleFieldChange('phoneNumberId', e.target.value)}
                    placeholder="1000123456789"
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Access Token</label>
                  <input
                    type="password"
                    required
                    value={fields.accessToken || ''}
                    onChange={(e) => handleFieldChange('accessToken', e.target.value)}
                    placeholder="EAAB..."
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
              </>
            )}

            {type === 'metaPage' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Page ID</label>
                  <input
                    type="text"
                    required
                    value={fields.pageId || ''}
                    onChange={(e) => handleFieldChange('pageId', e.target.value)}
                    placeholder="10987654321"
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Page Access Token</label>
                  <input
                    type="password"
                    required
                    value={fields.pageAccessToken || ''}
                    onChange={(e) => handleFieldChange('pageAccessToken', e.target.value)}
                    placeholder="EAAB..."
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
              </>
            )}

            {type === 'googleOAuth' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={fields.email || ''}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    placeholder="automation@company.com"
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Access Token</label>
                  <input
                    type="password"
                    required
                    value={fields.accessToken || ''}
                    onChange={(e) => handleFieldChange('accessToken', e.target.value)}
                    placeholder="ya29..."
                    className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                  />
                </div>
              </>
            )}

            {type === 'httpBearer' && (
              <div>
                <label className="block text-sm font-medium mb-1">Bearer Token</label>
                <input
                  type="password"
                  required
                  value={fields.token || ''}
                  onChange={(e) => handleFieldChange('token', e.target.value)}
                  placeholder="Bearer token value"
                  className="w-full px-3 py-2 bg-background border rounded-lg text-sm font-mono"
                />
              </div>
            )}

            {type === 'httpBasic' && (
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
                  <label className="block text-sm font-medium mb-1">Password</label>
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

            {type === 'httpHeader' && (
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
                  <label className="block text-sm font-medium mb-1">Header Value</label>
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
                {loading ? 'Encrypting & Saving...' : 'Save Credential'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ReauthModal
        isOpen={showReauth}
        actionDescription="Creating a credential is a sensitive action. Please confirm your password or passkey to proceed."
        onSuccess={() => setShowReauth(false)}
        onCancel={() => setShowReauth(false)}
      />
    </>
  );
}
