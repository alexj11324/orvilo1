import { ENABLE_BUSINESS_FEATURES } from '@orvilo/business-const';

import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import { type GlobalServerConfig } from '@/types/serverConfig';

export const getServerAuthConfig = (): GlobalServerConfig => {
  return {
    aiProvider: {},
    authAccountsUrl: authEnv.AUTH_ACCOUNTS_URL || 'https://accounts.aspectlylabs.com',
    disableEmailPassword: authEnv.AUTH_DISABLE_EMAIL_PASSWORD,
    enableBusinessFeatures: ENABLE_BUSINESS_FEATURES,
    enableEmailVerification: authEnv.AUTH_EMAIL_VERIFICATION,
    enableMagicLink: authEnv.AUTH_ENABLE_MAGIC_LINK,
    enableMarketTrustedClient: !!(
      appEnv.MARKET_TRUSTED_CLIENT_SECRET && appEnv.MARKET_TRUSTED_CLIENT_ID
    ),
    telemetry: {},
  };
};
