import { describe, expect, it } from 'vitest';

import {
  hasApiCredential,
  hasEndpoint,
  isPersistableBaseURL,
  resolveProviderStatus,
} from './providerStatus';

describe('isPersistableBaseURL', () => {
  it('blocks invalid proxy URLs and allows empty or valid ones', () => {
    expect(isPersistableBaseURL('abc')).toBe(false);
    expect(isPersistableBaseURL('https://proxy.example.com/v1')).toBe(true);
    expect(isPersistableBaseURL('')).toBe(true);
    expect(isPersistableBaseURL(undefined)).toBe(true);
  });
});

describe('hasApiCredential', () => {
  it('uses the stored key until the form has a value', () => {
    expect(hasApiCredential({}, { apiKey: 'sk-1' })).toBe(true);
  });

  it('treats a cleared form key as removed even when the stored key is stale', () => {
    expect(hasApiCredential({ apiKey: '' }, { apiKey: 'sk-1' })).toBe(false);
  });

  it('recognises other credential shapes', () => {
    expect(hasApiCredential({ accessKeyId: 'AKIA' })).toBe(true);
    expect(hasApiCredential({ username: 'u' })).toBe(false);
    expect(hasApiCredential({ password: 'p', username: 'u' })).toBe(true);
  });
});

describe('hasEndpoint', () => {
  it('does not count an invalid typed proxy URL', () => {
    expect(hasEndpoint({ baseURL: 'abc' })).toBe(false);
    expect(hasEndpoint({ baseURL: 'abc' }, { baseURL: 'https://saved.example.com' })).toBe(true);
  });

  it('counts a valid URL and honours a deliberate clear', () => {
    expect(hasEndpoint({ baseURL: 'https://proxy.example.com' })).toBe(true);
    expect(hasEndpoint({ baseURL: '' }, { baseURL: 'https://saved.example.com' })).toBe(false);
    expect(hasEndpoint({ endpoint: 'https://x.openai.azure.com' })).toBe(true);
  });
});

describe('before the form has filled', () => {
  it('reads the stored values when the live form value is null or undefined', () => {
    expect(hasEndpoint(null, { baseURL: 'https://example.com/v1' })).toBe(true);
    expect(hasEndpoint(undefined, { baseURL: 'https://example.com/v1' })).toBe(true);
    expect(hasApiCredential(null, { apiKey: 'sk-test' })).toBe(true);
  });

  it('is empty when neither the form nor the stored config exists', () => {
    expect(hasEndpoint(null, null)).toBe(false);
    expect(hasEndpoint(undefined, undefined)).toBe(false);
    expect(hasApiCredential(null, null)).toBe(false);
  });
});

describe('resolveProviderStatus', () => {
  const base = {
    enabled: false,
    hasApiKey: false,
    hasProviderEndpoint: false,
    isOAuthAuthenticated: false,
  };

  it('is enabled whenever the provider is switched on', () => {
    expect(resolveProviderStatus({ ...base, enabled: true })).toBe('enabled');
  });

  it('is not configured when off with nothing set, disabled when something is set', () => {
    expect(resolveProviderStatus(base)).toBe('notConfigured');
    expect(resolveProviderStatus({ ...base, hasApiKey: true })).toBe('disabled');
    expect(resolveProviderStatus({ ...base, isOAuthAuthenticated: true })).toBe('disabled');
  });

  it('flips to not configured right after the key is cleared', () => {
    const hasApiKey = hasApiCredential({ apiKey: '' }, { apiKey: 'sk-1' });
    expect(resolveProviderStatus({ ...base, hasApiKey })).toBe('notConfigured');
  });
});
