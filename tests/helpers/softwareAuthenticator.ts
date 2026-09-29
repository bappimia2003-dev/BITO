import crypto from 'node:crypto';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { encode } from '../../apps/web/node_modules/@simplewebauthn/server/esm/helpers/iso/isoCBOR.js';

export class SoftwareAuthenticator {
  private keyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  public credentialId: Buffer;
  public counter: number;

  constructor() {
    this.keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    this.credentialId = crypto.randomBytes(16);
    this.counter = 0;
  }

  public createRegistrationResponse(
    challenge: string,
    origin: string,
    rpID: string
  ): { response: RegistrationResponseJSON; credentialId: string } {
    const jwk = this.keyPair.publicKey.export({ format: 'jwk' });

    const coseKey = new Map();
    coseKey.set(1, 2); // kty: EC2
    coseKey.set(3, -7); // alg: ES256
    coseKey.set(-1, 1); // crv: P-256
    coseKey.set(-2, Buffer.from(jwk.x!, 'base64url'));
    coseKey.set(-3, Buffer.from(jwk.y!, 'base64url'));
    const pubKeyBytes = encode(coseKey);

    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(this.credentialId.length);

    const rpIdHash = crypto.createHash('sha256').update(rpID).digest();
    const flags = Buffer.from([0x45]); // UP, UV, AT
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(this.counter);

    const aaguid = Buffer.alloc(16); // 16 bytes zeros
    const authData = Buffer.concat([
      rpIdHash,
      flags,
      signCount,
      aaguid,
      credIdLen,
      this.credentialId,
      pubKeyBytes,
    ]);

    const attestationMap = new Map();
    attestationMap.set('fmt', 'none');
    attestationMap.set('attStmt', new Map());
    attestationMap.set('authData', authData);

    const clientData = {
      type: 'webauthn.create',
      challenge,
      origin,
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');
    const credIdBase64Url = this.credentialId.toString('base64url');

    const regResponse: RegistrationResponseJSON = {
      id: credIdBase64Url,
      rawId: credIdBase64Url,
      response: {
        clientDataJSON,
        attestationObject: Buffer.from(encode(attestationMap)).toString('base64url'),
        transports: ['internal'],
      },
      type: 'public-key',
      clientExtensionResults: {},
    };

    return { response: regResponse, credentialId: credIdBase64Url };
  }

  public createAuthenticationResponse(
    challenge: string,
    origin: string,
    rpID: string,
    counterIncrement: number = 1
  ): AuthenticationResponseJSON {
    this.counter += counterIncrement;

    const rpIdHash = crypto.createHash('sha256').update(rpID).digest();
    const clientData = {
      type: 'webauthn.get',
      challenge,
      origin,
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');
    const clientDataHash = crypto
      .createHash('sha256')
      .update(Buffer.from(clientDataJSON, 'base64url'))
      .digest();

    const flags = Buffer.from([0x05]); // UP, UV
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(this.counter);
    const authData = Buffer.concat([rpIdHash, flags, signCount]);

    const signInput = Buffer.concat([authData, clientDataHash]);
    const signature = crypto.sign('sha256', signInput, this.keyPair.privateKey);

    const credIdBase64Url = this.credentialId.toString('base64url');

    return {
      id: credIdBase64Url,
      rawId: credIdBase64Url,
      response: {
        clientDataJSON,
        authenticatorData: authData.toString('base64url'),
        signature: signature.toString('base64url'),
      },
      type: 'public-key',
      clientExtensionResults: {},
    };
  }
}
