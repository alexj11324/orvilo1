import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const isInVercel = process.env.VERCEL === '1';

// Vercel URL fallback order (by stability):
// 1. VERCEL_PROJECT_PRODUCTION_URL - project level, most stable
// 2. VERCEL_URL - deployment level, changes every deployment
// 3. VERCEL_BRANCH_URL - branch level, stable across deployments on same branch
const getVercelUrl = () => {
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `https://${process.env.VERCEL_BRANCH_URL}`;
};

const APP_URL =
  process.env.APP_URL ||
  (isInVercel
    ? getVercelUrl()
    : process.env.NODE_ENV === 'development'
      ? `http://localhost:${process.env.PORT || 3010}`
      : `http://localhost:${process.env.PORT || 3210}`);

// INTERNAL_APP_URL is used for server-to-server calls to bypass CDN/proxy
// Falls back to APP_URL if not set
const INTERNAL_APP_URL = process.env.INTERNAL_APP_URL || APP_URL;

export const getAppConfig = () => {
  return createEnv({
    clientPrefix: 'NEXT_PUBLIC_',
    client: {
      NEXT_PUBLIC_ENABLE_SENTRY: z.boolean(),
    },
    server: {
      DEFAULT_AGENT_CONFIG: z.string(),
      SYSTEM_AGENT: z.string().optional(),

      APP_URL: z.string(),
      INTERNAL_APP_URL: z.string().optional(),
      VERCEL_EDGE_CONFIG: z.string().optional(),
      MIDDLEWARE_REWRITE_THROUGH_LOCAL: z.boolean().optional(),

      CDN_USE_GLOBAL: z.boolean().optional(),
      CUSTOM_FONT_FAMILY: z.string().optional(),
      CUSTOM_FONT_URL: z.string().optional(),

      SSRF_ALLOW_PRIVATE_IP_ADDRESS: z.boolean().optional(),
      SSRF_ALLOW_IP_ADDRESS_LIST: z.string().optional(),

      MARKET_BASE_URL: z.string().optional(),
      /**
       * Trusted Client Secret for Market API authentication
       * 83-character credential supplied by the target Market service.
       * Must match the service configuration; a random 64-character hex
       * string does not satisfy this schema.
       */
      MARKET_TRUSTED_CLIENT_SECRET: z.string().length(83).optional(),
      /**
       * Trusted Client ID for Market API authentication
       * Must be registered in Market's TRUSTED_CLIENT_IDS whitelist
       * e.g., "orvilo-com", "orvilo-desktop"
       */
      MARKET_TRUSTED_CLIENT_ID: z.string().optional(),

      AGENT_GATEWAY_SERVICE_TOKEN: z.string().optional(),
      ENABLE_AGENT_GATEWAY: z.boolean().optional(),
      AGENT_GATEWAY_URL: z.string().url().optional(),
      /**
       * Enable Queue-based Agent Runtime
       * When true, use Hatchet for async agent execution (production)
       * When false, execute agent steps synchronously in current process (development)
       * @default false
       */
      enableQueueAgentRuntime: z.boolean().optional(),
      TELEMETRY_DISABLED: z.boolean().optional(),
    },
    runtimeEnv: {
      // Sentry
      NEXT_PUBLIC_ENABLE_SENTRY: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

      DEFAULT_AGENT_CONFIG: process.env.DEFAULT_AGENT_CONFIG || '',
      SYSTEM_AGENT: process.env.SYSTEM_AGENT,

      VERCEL_EDGE_CONFIG: process.env.VERCEL_EDGE_CONFIG,

      APP_URL,
      INTERNAL_APP_URL,
      MIDDLEWARE_REWRITE_THROUGH_LOCAL: process.env.MIDDLEWARE_REWRITE_THROUGH_LOCAL === '1',

      CUSTOM_FONT_FAMILY: process.env.CUSTOM_FONT_FAMILY,
      CUSTOM_FONT_URL: process.env.CUSTOM_FONT_URL,
      CDN_USE_GLOBAL: process.env.CDN_USE_GLOBAL === '1',

      SSRF_ALLOW_PRIVATE_IP_ADDRESS: process.env.SSRF_ALLOW_PRIVATE_IP_ADDRESS === '1',
      SSRF_ALLOW_IP_ADDRESS_LIST: process.env.SSRF_ALLOW_IP_ADDRESS_LIST,
      MARKET_BASE_URL: process.env.MARKET_BASE_URL,

      MARKET_TRUSTED_CLIENT_SECRET: process.env.MARKET_TRUSTED_CLIENT_SECRET,
      MARKET_TRUSTED_CLIENT_ID: process.env.MARKET_TRUSTED_CLIENT_ID,

      AGENT_GATEWAY_SERVICE_TOKEN: process.env.AGENT_GATEWAY_SERVICE_TOKEN,
      ENABLE_AGENT_GATEWAY: process.env.ENABLE_AGENT_GATEWAY === '1',
      AGENT_GATEWAY_URL: process.env.AGENT_GATEWAY_URL,
      enableQueueAgentRuntime: process.env.AGENT_RUNTIME_MODE === 'queue',
      TELEMETRY_DISABLED: process.env.TELEMETRY_DISABLED === '1',
    },
  });
};

export const appEnv = getAppConfig();
