import { AesGcmSecretCipher } from '../src/utils/secretCipher';

/** Test composition root; production models never read ambient configuration. */
export const createTestSecretCipher = () => {
  const secret = process.env.KEY_VAULTS_SECRET;
  if (!secret) throw new Error('KEY_VAULTS_SECRET is required by the test fixture');
  return AesGcmSecretCipher.fromBase64Key(secret);
};
