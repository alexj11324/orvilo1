import { type ServerConfigStore } from './store';

export const featureFlagsSelectors = (s: ServerConfigStore) => s.featureFlags;

/**
 * Marketplace-backed services need both halves: the deployment configured the
 * credentials (`serverConfig`) and the `market` flag offers them to this user.
 */
const marketOffered = (s: ServerConfigStore) => Boolean(s.featureFlags.showMarket);

export const serverConfigSelectors = {
  authAccountsUrl: (s: ServerConfigStore) =>
    s.serverConfig.authAccountsUrl || 'https://accounts.aspectlylabs.com',
  disableEmailPassword: (s: ServerConfigStore) => s.serverConfig.disableEmailPassword || false,
  enableBusinessFeatures: (s: ServerConfigStore) => s.serverConfig.enableBusinessFeatures || false,
  enableEmailVerification: (s: ServerConfigStore) =>
    s.serverConfig.enableEmailVerification || false,
  enableComposio: (s: ServerConfigStore) =>
    marketOffered(s) && (s.serverConfig.enableComposio || false),
  enableGatewayMode: (s: ServerConfigStore) => s.serverConfig.enableGatewayMode || false,
  enableOrviloSkill: (s: ServerConfigStore) =>
    marketOffered(s) && (s.serverConfig.enableOrviloSkill || false),
  enableMagicLink: (s: ServerConfigStore) => s.serverConfig.enableMagicLink || false,
  enableMarketTrustedClient: (s: ServerConfigStore) =>
    marketOffered(s) && (s.serverConfig.enableMarketTrustedClient || false),
  enableUploadFileToServer: (s: ServerConfigStore) => s.serverConfig.enableUploadFileToServer,
  enableMultimodalUnderstanding: (s: ServerConfigStore) =>
    s.serverConfig.enableMultimodalUnderstanding || false,
  enabledTelemetryChat: (s: ServerConfigStore) => s.serverConfig.telemetry.langfuse || false,
  isMobile: (s: ServerConfigStore) => s.isMobile || false,
  multimodalUnderstanding: (s: ServerConfigStore) => s.serverConfig.multimodalUnderstanding,
};
