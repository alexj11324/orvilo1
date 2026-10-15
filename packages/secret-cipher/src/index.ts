/** Authenticated secret encryption port. Configuration belongs to the caller. */
export interface SecretCipher {
  decrypt: (ciphertext: string) => Promise<{ plaintext: string; wasAuthentic: boolean }>;
  encrypt: (plaintext: string) => Promise<string>;
}

/** Lazy creation preserves startup without a secret until encryption is actually used. */
export type SecretCipherFactory = () => Promise<SecretCipher>;

/** AES-GCM wire format: hex IV:hex authentication tag:hex ciphertext. */
export class AesGcmSecretCipher implements SecretCipher {
  constructor(private readonly aesKey: CryptoKey) {}

  static async fromBase64Key(secret: string): Promise<AesGcmSecretCipher> {
    const rawKey = Buffer.from(secret, 'base64');
    if (![16, 24, 32].includes(rawKey.length)) {
      throw new Error(
        `\`KEY_VAULTS_SECRET\` must be 16, 24, or 32 bytes (128, 192, or 256 bits) when base64 decoded, got ${rawKey.length} bytes. ` +
          'Please run `openssl rand -base64 32` to create a valid key.',
      );
    }
    const aesKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
    return new this(aesKey);
  }

  /**
   * encrypt user private data
   */
  encrypt = async (keyVault: string): Promise<string> => {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // For GCM, 12-byte IV is recommended
    const encodedKeyVault = new TextEncoder().encode(keyVault);

    const encryptedData = await crypto.subtle.encrypt(
      {
        iv,
        name: 'AES-GCM',
      },
      this.aesKey,
      encodedKeyVault,
    );

    const buffer = Buffer.from(encryptedData);
    const authTag = buffer.slice(-16); // Authentication tag is in the last 16 bytes of encrypted data
    const encrypted = buffer.slice(0, -16); // The rest is encrypted data

    return `${Buffer.from(iv).toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  };

  // Assuming key and encrypted data are obtained from external sources
  decrypt = async (
    encryptedData: string,
  ): Promise<{ plaintext: string; wasAuthentic: boolean }> => {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');

    // Combine encrypted data and authentication tag
    const combined = Buffer.concat([encrypted, authTag]);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          iv,
          name: 'AES-GCM',
        },
        this.aesKey,
        combined,
      );

      const decrypted = new TextDecoder().decode(decryptedBuffer);
      return {
        plaintext: decrypted,
        wasAuthentic: true,
      };
    } catch {
      return {
        plaintext: '',
        wasAuthentic: false,
      };
    }
  };
}
