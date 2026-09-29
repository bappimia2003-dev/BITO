import { BitoError } from '@bito/shared';
import type { CredentialResolver } from '@bito/engine';
import { getDecryptedCredentialPayload } from '../repositories/credentials.js';

export class PostgresCredentialResolver implements CredentialResolver {
  private readonly secretsInUse = new Set<string>();

  getSecretsInUse(): string[] {
    return Array.from(this.secretsInUse);
  }

  async resolve(projectId: string, credentialId: string): Promise<Record<string, unknown>> {
    const cred = await getDecryptedCredentialPayload(credentialId);
    if (cred.projectId !== projectId) {
      throw BitoError(
        'FORBIDDEN',
        `Credential ${credentialId} does not belong to project ${projectId}`
      );
    }

    this.collectSecrets(cred.data);
    return cred.data;
  }

  private collectSecrets(data: unknown): void {
    if (!data) return;
    if (typeof data === 'string' && data.trim().length >= 4) {
      this.secretsInUse.add(data.trim());
    } else if (typeof data === 'object') {
      for (const val of Object.values(data as Record<string, unknown>)) {
        this.collectSecrets(val);
      }
    }
  }
}
