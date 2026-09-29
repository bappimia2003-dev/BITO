'use client';

import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';

export { browserSupportsWebAuthn };

export async function signInWithPasskey(): Promise<{
  id: string;
  email: string;
  displayName: string;
}> {
  // 1. Get login options
  const optRes = await fetch('/api/auth/passkey/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!optRes.ok) {
    const data = await optRes.json();
    throw new Error(data.error?.message || 'Failed to start passkey login');
  }

  const optionsJSON = await optRes.json();

  // 2. Browser authentication
  const response = await startAuthentication({ optionsJSON });

  // 3. Verify authentication
  const verifyRes = await fetch('/api/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response,
      challenge: optionsJSON.challenge,
    }),
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok) {
    throw new Error(verifyData.error?.message || 'Failed to verify passkey');
  }

  return verifyData.user;
}

export async function registerWithPasskey(
  email: string,
  displayName: string,
  deviceName?: string
): Promise<{ id: string; email: string; displayName: string }> {
  // 1. Get registration options
  const optRes = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, displayName }),
  });

  if (!optRes.ok) {
    const data = await optRes.json();
    throw new Error(data.error?.message || 'Failed to start passkey registration');
  }

  const optionsJSON = await optRes.json();

  // 2. Browser registration
  const response = await startRegistration({ optionsJSON });

  // 3. Verify registration
  const verifyRes = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response,
      challenge: optionsJSON.challenge,
      deviceName: deviceName || 'Passkey',
    }),
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok) {
    throw new Error(verifyData.error?.message || 'Failed to verify passkey registration');
  }

  return verifyData.user;
}

export async function addPasskeyToAccount(deviceName?: string): Promise<void> {
  const optRes = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!optRes.ok) {
    const data = await optRes.json();
    throw new Error(data.error?.message || 'Failed to start passkey creation');
  }

  const optionsJSON = await optRes.json();
  const response = await startRegistration({ optionsJSON });

  const verifyRes = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response,
      challenge: optionsJSON.challenge,
      deviceName: deviceName || 'Passkey',
    }),
  });

  if (!verifyRes.ok) {
    const data = await verifyRes.json();
    throw new Error(data.error?.message || 'Failed to verify passkey creation');
  }
}

export async function reauthWithPasskey(): Promise<void> {
  const optRes = await fetch('/api/auth/passkey/reauth/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!optRes.ok) {
    const data = await optRes.json();
    throw new Error(data.error?.message || 'Failed to start passkey re-authentication');
  }

  const optionsJSON = await optRes.json();
  const response = await startAuthentication({ optionsJSON });

  const verifyRes = await fetch('/api/auth/passkey/reauth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response,
      challenge: optionsJSON.challenge,
    }),
  });

  if (!verifyRes.ok) {
    const data = await verifyRes.json();
    throw new Error(data.error?.message || 'Failed to verify passkey re-authentication');
  }
}
