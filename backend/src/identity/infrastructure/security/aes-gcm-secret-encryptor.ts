import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ENV,
  type Env,
} from '../../../shared-kernel/infrastructure/config/env';
import type { SecretEncryptor } from '../../application/ports/security';

/** AES-256-GCM; output = 12-byte nonce | 16-byte tag | ciphertext (research R8). */
@Injectable()
export class AesGcmSecretEncryptor implements SecretEncryptor {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Pick<Env, 'TOKEN_ENCRYPTION_KEY'>) {
    this.key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64').subarray(0, 32);
  }

  encrypt(plaintext: string): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]);
  }

  decrypt(ciphertext: Buffer): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      ciphertext.subarray(0, 12),
    );
    decipher.setAuthTag(ciphertext.subarray(12, 28));
    return Buffer.concat([
      decipher.update(ciphertext.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
  }
}
