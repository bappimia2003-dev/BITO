'use client';

import { useState } from 'react';
import { KeyRound, Lock, AlertCircle, Loader2, X } from 'lucide-react';
import { reauthWithPasskey } from '../../lib/passkeyClient.js';

interface ReauthModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  hasPassword?: boolean;
}

export function ReauthModal({ isOpen, onSuccess, onCancel, hasPassword = true }: ReauthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  if (!isOpen) return null;

  async function handlePasswordReauth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Re-authentication failed');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyReauth() {
    setError(null);
    setPasskeyLoading(true);

    try {
      await reauthWithPasskey();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey re-authentication failed');
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 shadow-lg relative">
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Confirm Authentication</h3>
            <p className="text-xs text-muted-foreground">
              This action requires recent verification
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handlePasskeyReauth}
            disabled={passkeyLoading || loading}
            className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {passkeyLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            Verify with Passkey
          </button>

          {hasPassword && (
            <>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or password</span>
                </div>
              </div>

              <form onSubmit={handlePasswordReauth} className="space-y-3">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={loading || passkeyLoading}
                  className="w-full py-2 px-4 rounded-lg border border-input hover:bg-muted font-medium text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Verify Password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
