import { describe, it, expect } from 'vitest';
import {
  isPrivateOrBlockedIp,
  validateUrlSsrf,
  safeHttp,
} from '../src/server/security/safeHttp.js';

describe('SafeHttp and SSRF Protection', () => {
  it('identifies private, loopback, and cloud metadata IPv4 addresses as blocked', () => {
    // Pass false to explicitly enforce blocking checks
    expect(isPrivateOrBlockedIp('127.0.0.1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('127.0.1.2', false)).toBe(true);
    expect(isPrivateOrBlockedIp('10.0.0.1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('10.255.255.255', false)).toBe(true);
    expect(isPrivateOrBlockedIp('172.16.0.1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('172.31.255.254', false)).toBe(true);
    expect(isPrivateOrBlockedIp('172.15.0.1', false)).toBe(false);
    expect(isPrivateOrBlockedIp('172.32.0.1', false)).toBe(false);
    expect(isPrivateOrBlockedIp('192.168.0.1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('192.168.1.100', false)).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.169.254', false)).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.1.1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('100.64.0.1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('100.127.255.254', false)).toBe(true);
    expect(isPrivateOrBlockedIp('0.0.0.0', false)).toBe(true);
    // Public IPs should pass
    expect(isPrivateOrBlockedIp('8.8.8.8', false)).toBe(false);
    expect(isPrivateOrBlockedIp('93.184.216.34', false)).toBe(false);
  });

  it('identifies IPv6 loopback, link-local, and IPv4-mapped addresses as blocked', () => {
    expect(isPrivateOrBlockedIp('::1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('::', false)).toBe(true);
    expect(isPrivateOrBlockedIp('fc00::1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('fd12:3456:789a::1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('fe80::1', false)).toBe(true);
    // IPv4-mapped
    expect(isPrivateOrBlockedIp('::ffff:127.0.0.1', false)).toBe(true);
    expect(isPrivateOrBlockedIp('::ffff:169.254.169.254', false)).toBe(true);
    expect(isPrivateOrBlockedIp('::ffff:8.8.8.8', false)).toBe(false);
  });

  it('rejects forbidden protocols and private IP hostnames in validateUrlSsrf', async () => {
    // Protocol checks
    await expect(validateUrlSsrf('ftp://example.com/file', false)).rejects.toThrow(
      'Disallowed protocol'
    );
    await expect(validateUrlSsrf('file:///etc/passwd', false)).rejects.toThrow(
      'Disallowed protocol'
    );

    // Literal private IP
    await expect(validateUrlSsrf('http://127.0.0.1:8080/metrics', false)).rejects.toThrow(
      'blocked'
    );
    await expect(validateUrlSsrf('http://169.254.169.254/latest/meta-data', false)).rejects.toThrow(
      'blocked'
    );
    await expect(validateUrlSsrf('http://10.0.0.5:3000/internal', false)).rejects.toThrow(
      'blocked'
    );

    // Localhost DNS resolution
    await expect(validateUrlSsrf('http://localhost:3000', false)).rejects.toThrow('blocked');
  });

  it('allows private IPs when allowPrivate is true', async () => {
    expect(isPrivateOrBlockedIp('127.0.0.1', true)).toBe(false);
    const parsed = await validateUrlSsrf('http://127.0.0.1:8080/metrics', true);
    expect(parsed.hostname).toBe('127.0.0.1');
  });

  it('rejects oversized request bodies > 5MB', async () => {
    const hugeBody = 'x'.repeat(5 * 1024 * 1024 + 10);
    await expect(
      safeHttp.fetch({
        url: 'https://example.com',
        method: 'POST',
        body: hugeBody,
      })
    ).rejects.toThrow('5 MB limit');
  });
});
