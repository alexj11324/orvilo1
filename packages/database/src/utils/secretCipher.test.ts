// @vitest-environment node
import { type CipherGCMTypes, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AesGcmSecretCipher } from './secretCipher';

describe('secret cipher compatibility', () => {
  it.each([16, 24, 32])('reads legacy AES-GCM ciphertext with a %i byte key', async (length) => {
    const key = randomBytes(length);
    const iv = randomBytes(12);
    const algorithm = `aes-${length * 8}-gcm` as CipherGCMTypes;
    const legacy = createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([legacy.update('secret 🔒', 'utf8'), legacy.final()]);
    const wire = `${iv.toString('hex')}:${legacy.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
    const cipher = await AesGcmSecretCipher.fromBase64Key(key.toString('base64'));
    expect(await cipher.decrypt(wire)).toEqual({ plaintext: 'secret 🔒', wasAuthentic: true });

    const [newIv, tag, ciphertext] = (await cipher.encrypt('new secret')).split(':');
    const oldReader = createDecipheriv(algorithm, key, Buffer.from(newIv, 'hex'));
    oldReader.setAuthTag(Buffer.from(tag, 'hex'));
    expect(
      Buffer.concat([oldReader.update(Buffer.from(ciphertext, 'hex')), oldReader.final()]).toString(
        'utf8',
      ),
    ).toBe('new secret');
  });

  it('rejects altered tags and wrong keys without returning plaintext', async () => {
    const cipher = await AesGcmSecretCipher.fromBase64Key(randomBytes(32).toString('base64'));
    const wire = await cipher.encrypt('sensitive');
    const parts = wire.split(':');
    parts[1] = '00'.repeat(16);
    expect(await cipher.decrypt(parts.join(':'))).toEqual({ plaintext: '', wasAuthentic: false });
    const other = await AesGcmSecretCipher.fromBase64Key(randomBytes(32).toString('base64'));
    expect(await other.decrypt(wire)).toEqual({ plaintext: '', wasAuthentic: false });
    await expect(cipher.decrypt('not-a-ciphertext')).rejects.toThrow(
      'Invalid encrypted data format',
    );
  });
});
