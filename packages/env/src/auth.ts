import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      /** Accounts portal origin the app bounces sign-in to (e.g. https://accounts.aspectlylabs.com). */
      AUTH_ACCOUNTS_URL?: string;
      /** Cookie parent domain (e.g. `.aspectlylabs.com`); host-only when unset. */
      AUTH_COOKIE_DOMAIN?: string;
      /** Namespace of the legacy Better Auth cookie (`<prefix>.session_token`), dual-read during migration. Defaults to `better-auth`. */
      AUTH_COOKIE_PREFIX?: string;
      AUTH_DISABLE_EMAIL_PASSWORD?: string;
      AUTH_EMAIL_VERIFICATION?: string;
      AUTH_ENABLE_MAGIC_LINK?: string;
      AUTH_SESSION_TTL_SECONDS?: string;

      CASDOOR_WEBHOOK_SECRET?: string;

      /** Clerk Backend API base; defaults to https://api.clerk.com. */
      CLERK_API_URL?: string;
      /** Comma-separated `azp` allowlist for session token exchange. */
      CLERK_AUTHORIZED_PARTIES?: string;
      /** Clerk issuer / frontend API origin, e.g. https://clerk.aspectlylabs.com. */
      CLERK_ISSUER?: string;
      /** PEM public key for fully offline session JWT verification. */
      CLERK_JWT_KEY?: string;
      /** Clerk Backend API secret key (sk_*). Required for user provisioning. */
      CLERK_SECRET_KEY?: string;

      /**
       * Internal JWT expiration time for lambda → async calls.
       * Format: number followed by unit (s=seconds, m=minutes, h=hours)
       * Examples: '10s', '1m', '1h'
       * Should be as short as possible for security, but long enough to account for network latency and server processing time.
       * @default '30s'
       */
      INTERNAL_JWT_EXPIRATION?: string;

      // ===== JWKS Key ===== //
      /**
       * Generic JWKS key for signing/verifying JWTs.
       * Used for internal service authentication and other cryptographic operations.
       * Must be a JWKS JSON string containing an RS256 RSA key pair.
       * Can be generated using `node scripts/generate-oidc-jwk.mjs`.
       */
      JWKS_KEY?: string;

      LOGTO_WEBHOOK_SIGNING_KEY?: string;
    }
  }
}

export const getAuthConfig = () => {
  return createEnv({
    clientPrefix: 'NEXT_PUBLIC_',
    client: {},
    server: {
      AUTH_ACCOUNTS_URL: z.string().optional(),
      AUTH_COOKIE_DOMAIN: z.string().optional(),
      AUTH_COOKIE_PREFIX: z.string().optional(),
      AUTH_DISABLE_EMAIL_PASSWORD: z.boolean().optional().default(false),
      AUTH_EMAIL_VERIFICATION: z.boolean().optional().default(false),
      AUTH_ENABLE_MAGIC_LINK: z.boolean().optional().default(false),
      AUTH_SESSION_TTL_SECONDS: z.number().optional(),

      CLERK_API_URL: z.string().optional(),
      CLERK_AUTHORIZED_PARTIES: z.string().optional(),
      CLERK_ISSUER: z.string().optional(),
      CLERK_JWT_KEY: z.string().optional(),
      CLERK_SECRET_KEY: z.string().optional(),

      LOGTO_WEBHOOK_SIGNING_KEY: z.string().optional(),

      // Casdoor
      CASDOOR_WEBHOOK_SECRET: z.string().optional(),

      // Generic JWKS key for signing/verifying JWTs
      JWKS_KEY: z.string().optional(),
      ENABLE_OIDC: z.boolean(),

      // Internal JWT expiration time (e.g., '10s', '1m', '1h')
      INTERNAL_JWT_EXPIRATION: z.string().default('30s'),
    },

    runtimeEnv: {
      AUTH_ACCOUNTS_URL: process.env.AUTH_ACCOUNTS_URL,
      AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
      AUTH_COOKIE_PREFIX: process.env.AUTH_COOKIE_PREFIX,
      AUTH_DISABLE_EMAIL_PASSWORD: process.env.AUTH_DISABLE_EMAIL_PASSWORD === '1',
      AUTH_EMAIL_VERIFICATION: process.env.AUTH_EMAIL_VERIFICATION === '1',
      AUTH_ENABLE_MAGIC_LINK: process.env.AUTH_ENABLE_MAGIC_LINK === '1',
      AUTH_SESSION_TTL_SECONDS: process.env.AUTH_SESSION_TTL_SECONDS
        ? Number.parseInt(process.env.AUTH_SESSION_TTL_SECONDS, 10)
        : undefined,

      CLERK_API_URL: process.env.CLERK_API_URL,
      CLERK_AUTHORIZED_PARTIES: process.env.CLERK_AUTHORIZED_PARTIES,
      CLERK_ISSUER: process.env.CLERK_ISSUER,
      CLERK_JWT_KEY: process.env.CLERK_JWT_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,

      // LOGTO
      LOGTO_WEBHOOK_SIGNING_KEY: process.env.LOGTO_WEBHOOK_SIGNING_KEY,

      // Casdoor
      CASDOOR_WEBHOOK_SECRET: process.env.CASDOOR_WEBHOOK_SECRET,

      JWKS_KEY: process.env.JWKS_KEY,
      ENABLE_OIDC: !!process.env.JWKS_KEY,

      // Internal JWT expiration time
      INTERNAL_JWT_EXPIRATION: process.env.INTERNAL_JWT_EXPIRATION,
    },
  });
};

export const authEnv = getAuthConfig();

// Auth headers and constants
export const ORVILO_AUTH_HEADER = 'X-orvilo-auth';
export const ORVILO_OIDC_AUTH_HEADER = 'Oidc-Auth';
