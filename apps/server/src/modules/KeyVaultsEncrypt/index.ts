import { getServerDBConfig } from '@/config/db';
import { AesGcmSecretCipher } from '@/database/utils/secretCipher';
import { type UserKeyVaults } from '@/types/user/settings';

export class KeyVaultsGateKeeper extends AesGcmSecretCipher {
  static initWithEnvKey = async () => {
    const { KEY_VAULTS_SECRET } = getServerDBConfig();
    if (!KEY_VAULTS_SECRET)
      throw new Error(` \`KEY_VAULTS_SECRET\` is not set, please set it in your environment variables.

If you don't have it, please run \`openssl rand -base64 32\` to create one.
`);

    return KeyVaultsGateKeeper.fromBase64Key(KEY_VAULTS_SECRET);
  };

  static getUserKeyVaults = async (
    encryptedKeyVaults: string | null,
    userId?: string,
  ): Promise<UserKeyVaults> => {
    if (!encryptedKeyVaults) return {};
    // Decrypt keyVaults
    let decryptKeyVaults = {};

    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    const { wasAuthentic, plaintext } = await gateKeeper.decrypt(encryptedKeyVaults);

    if (wasAuthentic) {
      try {
        if (!!plaintext) decryptKeyVaults = JSON.parse(plaintext);
      } catch (e) {
        console.error(`Failed to parse keyVaults, userId: ${userId}. Error:`, e);
      }
    }

    return decryptKeyVaults as UserKeyVaults;
  };
}
