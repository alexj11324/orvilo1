import { describe, expect, it } from 'vitest';

import { DEFAULT_FEATURE_FLAGS, mapFeatureFlagsEnvToState } from '@/config/featureFlags';

import { featureFlagsSelectors, serverConfigSelectors } from './selectors';
import { initServerConfigStore } from './store';

describe('featureFlagsSelectors', () => {
  it('should return feature flags from store', () => {
    const store = initServerConfigStore({
      featureFlags: {
        ...mapFeatureFlagsEnvToState(DEFAULT_FEATURE_FLAGS),
        isAgentEditable: false,
        showProvider: true,
        showMarket: true,
      },
    });

    const result = featureFlagsSelectors(store.getState());

    expect(result.isAgentEditable).toBe(false);
    expect(result.showProvider).toBe(true);
    expect(result.showMarket).toBe(true);
  });
});

describe('serverConfigSelectors', () => {
  describe('marketplace-backed services', () => {
    const configured = {
      aiProvider: {},
      enableComposio: true,
      enableMarketTrustedClient: true,
      enableOrviloSkill: true,
      telemetry: {},
    };
    const withMarket = (showMarket: boolean) =>
      initServerConfigStore({
        featureFlags: { ...mapFeatureFlagsEnvToState(DEFAULT_FEATURE_FLAGS), showMarket },
        serverConfig: configured,
      }).getState();

    it('stays off by default even when the deployment configured the credentials', () => {
      const state = initServerConfigStore({ serverConfig: configured }).getState();

      expect(serverConfigSelectors.enableComposio(state)).toBe(false);
      expect(serverConfigSelectors.enableOrviloSkill(state)).toBe(false);
      expect(serverConfigSelectors.enableMarketTrustedClient(state)).toBe(false);
    });

    it('is offered once the market flag is on', () => {
      const state = withMarket(true);

      expect(serverConfigSelectors.enableComposio(state)).toBe(true);
      expect(serverConfigSelectors.enableOrviloSkill(state)).toBe(true);
      expect(serverConfigSelectors.enableMarketTrustedClient(state)).toBe(true);
    });

    it('needs the deployment credentials as well as the flag', () => {
      const state = initServerConfigStore({
        featureFlags: { ...mapFeatureFlagsEnvToState(DEFAULT_FEATURE_FLAGS), showMarket: true },
        serverConfig: { aiProvider: {}, telemetry: {} },
      }).getState();

      expect(serverConfigSelectors.enableComposio(state)).toBe(false);
      expect(withMarket(false).serverConfig.enableComposio).toBe(true);
      expect(serverConfigSelectors.enableComposio(withMarket(false))).toBe(false);
    });
  });

  describe('enableGatewayMode', () => {
    it('should return true when gateway mode is enabled', () => {
      const store = initServerConfigStore({
        serverConfig: {
          aiProvider: {},
          enableGatewayMode: true,
          telemetry: {},
        },
      });

      const result = serverConfigSelectors.enableGatewayMode(store.getState());

      expect(result).toBe(true);
    });

    it('should return false when gateway mode is not defined', () => {
      const store = initServerConfigStore({
        serverConfig: {
          aiProvider: {},
          telemetry: {},
        },
      });

      const result = serverConfigSelectors.enableGatewayMode(store.getState());

      expect(result).toBe(false);
    });
  });

  describe('enabledTelemetryChat', () => {
    it('should return langfuse value from store when defined', () => {
      const store = initServerConfigStore({
        serverConfig: {
          telemetry: { langfuse: true },
          aiProvider: {},
        },
      });

      const result = serverConfigSelectors.enabledTelemetryChat(store.getState());

      expect(result).toBe(true);
    });

    it('should return false when langfuse is not defined', () => {
      const store = initServerConfigStore({
        serverConfig: {
          telemetry: {},
          aiProvider: {},
        },
      });

      const result = serverConfigSelectors.enabledTelemetryChat(store.getState());

      expect(result).toBe(false);
    });
  });
});
