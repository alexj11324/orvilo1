import type { Config } from './generated/client';
import { createClient, createConfig } from './generated/client';
import { Orvilo } from './generated/sdk.gen';

export const DEFAULT_BASE_URL = 'https://orvilo.aspectlylabs.com';

export interface OrviloOptions extends Omit<Config, 'auth' | 'baseUrl'> {
  /** Orvilo API Key (`sk-ov-...`) or an OIDC JWT */
  apiKey: string;
  /** API origin, defaults to Orvilo Cloud (`https://orvilo.aspectlylabs.com`) */
  baseURL?: string;
}

/**
 * Create a resource-style Orvilo API client: `orvilo.agents.list()`,
 * `orvilo.files.uploadBatch()`, `orvilo.users.me()`, …
 *
 * Resources, methods, and schemas are generated from
 * `packages/openapi/openapi.yml` — run `bun generate` after the spec changes.
 */
export const createOrvilo = (options: OrviloOptions): Orvilo => {
  const { apiKey, baseURL = DEFAULT_BASE_URL, ...clientConfig } = options;
  const config: Config = { ...clientConfig, auth: () => apiKey, baseUrl: baseURL };

  return new Orvilo({ client: createClient(createConfig(config)) });
};

export type { Client, Config } from './generated/client';
export { Orvilo } from './generated/sdk.gen';
export type * from './generated/types.gen';
