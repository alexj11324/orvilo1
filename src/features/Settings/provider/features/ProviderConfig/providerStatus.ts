import { AiProviderBaseURLSchema } from 'model-bank/aiProvider';

export type ProviderStatus = 'disabled' | 'enabled' | 'notConfigured';

export interface CredentialValues {
  accessKeyId?: string | null;
  apiKey?: string | null;
  baseURL?: string | null;
  endpoint?: string | null;
  password?: string | null;
  secretAccessKey?: string | null;
  username?: string | null;
}

export const isValidBaseURL = (value: string) => AiProviderBaseURLSchema.safeParse(value).success;

/**
 * Autosave guard: an invalid proxy URL must never be written. Empty is allowed
 * (it clears the field); anything else has to pass the same schema the field
 * validator uses.
 */
export const isPersistableBaseURL = (baseURL?: string | null) =>
  !baseURL || isValidBaseURL(baseURL);

/**
 * The live form value wins over the stored one as soon as the form has one.
 * `undefined` means "the form has not been filled yet"; an empty string is a
 * deliberate clear and must not fall back to the stale stored value.
 */
const pickLive = <T>(live: T | undefined, stored: T | undefined) =>
  live === undefined ? stored : live;

/**
 * A typed-but-invalid proxy URL is not saved, so it must not count as
 * configured either: fall back to the stored value until the input is valid.
 */
const pickBaseURL = (live?: string | null, stored?: string | null) =>
  live && !isValidBaseURL(live) ? stored : pickLive(live, stored);

export const hasEndpoint = (live: CredentialValues, stored: CredentialValues = {}) =>
  !!pickBaseURL(live.baseURL, stored.baseURL) || !!pickLive(live.endpoint, stored.endpoint);

export const hasApiCredential = (live: CredentialValues, stored: CredentialValues = {}) => {
  const read = (key: keyof CredentialValues) => pickLive(live[key], stored[key]);

  return !!(
    read('apiKey') ||
    read('accessKeyId') ||
    read('secretAccessKey') ||
    (read('username') && read('password'))
  );
};

/**
 * "Not configured" is only claimed when nothing the provider could be
 * configured with is present; the connectivity result is not persisted, so no
 * connected/failed state is shown.
 */
export const resolveProviderStatus = ({
  enabled,
  hasApiKey,
  hasProviderEndpoint,
  isOAuthAuthenticated,
}: {
  enabled: boolean;
  hasApiKey: boolean;
  hasProviderEndpoint: boolean;
  isOAuthAuthenticated: boolean;
}): ProviderStatus => {
  if (enabled) return 'enabled';

  return hasApiKey || hasProviderEndpoint || isOAuthAuthenticated ? 'disabled' : 'notConfigured';
};
