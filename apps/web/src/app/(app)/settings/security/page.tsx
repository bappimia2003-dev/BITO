'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  Shield,
  Trash2,
  Plus,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
} from 'lucide-react';
import { addPasskeyToAccount, browserSupportsWebAuthn } from '../../../../lib/passkeyClient.js';
import { ReauthModal } from '../../../../components/auth/ReauthModal.js';

interface PasskeyItem {
  id: string;
  credentialId: string;
  deviceName: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  hasPassword: boolean;
  passkeyCount: number;
}

export default function SecuritySettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // New passkey device name
  const [newDeviceName, setNewDeviceName] = useState('');
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);

  // Re-auth modal
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const fetchSecurityData = useCallback(async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) throw new Error('Failed to load user info');
      const meData = await meRes.json();
      setUser(meData.user);

      const passkeysRes = await fetch('/api/auth/passkeys');
      if (passkeysRes.ok) {
        const passkeysData = await passkeysRes.json();
        setPasskeys(passkeysData.passkeys || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading security settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityData();
  }, [fetchSecurityData]);

  async function executeWithReauth(action: () => Promise<void>) {
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('REAUTH_REQUIRED') || msg.includes('Recent authentication required')) {
        setPendingAction(() => action);
        setReauthOpen(true);
      } else {
        setError(msg);
      }
    }
  }

  async function handleAddPasskey() {
    await executeWithReauth(async () => {
      setAddingPasskey(true);
      try {
        if (!browserSupportsWebAuthn()) {
          throw new Error('Your browser does not support passkeys');
        }
        await addPasskeyToAccount(newDeviceName || 'Security Key');
        setNewDeviceName('');
        setShowAddInput(false);
        setSuccess('Passkey registered successfully');
        await fetchSecurityData();
      } finally {
        setAddingPasskey(false);
      }
    });
  }

  async function handleDeletePasskey(id: string) {
    if (!confirm('Are you sure you want to remove this passkey?')) return;

    await executeWithReauth(async () => {
      const res = await fetch(`/api/auth/passkeys/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to remove passkey');
      }
      setSuccess('Passkey removed');
      await fetchSecurityData();
    });
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    await executeWithReauth(async () => {
      setChangingPassword(true);
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Failed to change password');
        }
        setNewPassword('');
        setConfirmPassword('');
        setSuccess('Password updated successfully');
        await fetchSecurityData();
      } finally {
        setChangingPassword(false);
      }
    });
  }

  async function handleSignOutEverywhere() {
    if (!confirm('This will sign you out on all devices. Continue?')) return;

    await executeWithReauth(async () => {
      const res = await fetch('/api/auth/logout-all', {
        method: 'POST',
      });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to sign out everywhere');
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your passkeys, password, and active authentication sessions.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Passkeys Section */}
      <div className="border border-border rounded-xl bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Passkeys</h2>
              <p className="text-xs text-muted-foreground">
                Biometric login using Touch ID, Face ID, Windows Hello, or security keys
              </p>
            </div>
          </div>
          {!showAddInput && (
            <button
              onClick={() => setShowAddInput(true)}
              className="py-1.5 px-3 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Passkey
            </button>
          )}
        </div>

        {showAddInput && (
          <div className="mb-4 p-4 border border-input rounded-lg bg-muted/30 flex items-center gap-3">
            <input
              type="text"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="e.g. MacBook Pro Touch ID"
              className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-sm"
            />
            <button
              onClick={handleAddPasskey}
              disabled={addingPasskey}
              className="py-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {addingPasskey ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Register
            </button>
            <button
              onClick={() => setShowAddInput(false)}
              className="py-1.5 px-3 rounded-lg border border-input text-xs font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="divide-y divide-border">
          {passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">
              No passkeys configured yet. Add one for faster and more secure sign-ins.
            </p>
          ) : (
            passkeys.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    {p.deviceName || 'Passkey'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Added: {new Date(p.createdAt).toLocaleDateString()}
                    {p.lastUsedAt && ` • Last used: ${new Date(p.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePasskey(p.id)}
                  title="Remove passkey"
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Password Section */}
      <div className="border border-border rounded-xl bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">
              {user?.hasPassword ? 'Change Password' : 'Set a Password'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Minimum 10 characters. Avoid common, easily guessed passwords.
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={changingPassword}
            className="py-2 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50"
          >
            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {user?.hasPassword ? 'Update Password' : 'Set Password'}
          </button>
        </form>
      </div>

      {/* Danger Zone / Sessions */}
      <div className="border border-destructive/20 rounded-xl bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg text-destructive">Sign Out Everywhere</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Revokes all active sessions on all browsers and devices.
            </p>
          </div>
          <button
            onClick={handleSignOutEverywhere}
            className="py-2 px-4 rounded-lg border border-destructive text-destructive hover:bg-destructive/10 font-medium text-sm transition flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Sign Out Everywhere
          </button>
        </div>
      </div>

      {/* Reauth Modal */}
      <ReauthModal
        isOpen={reauthOpen}
        hasPassword={user?.hasPassword ?? true}
        onCancel={() => {
          setReauthOpen(false);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          setReauthOpen(false);
          if (pendingAction) {
            const action = pendingAction;
            setPendingAction(null);
            await action();
          }
        }}
      />
    </div>
  );
}
