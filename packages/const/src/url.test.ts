import { describe, expect, it } from 'vitest';

import { isOfficialCloudServer,OFFICIAL_DOMAIN } from './url';

describe('isOfficialCloudServer', () => {
  // Every case is derived from the configured domain: hardcoding it here is how
  // this test went stale the last time the deployment's domain changed.
  it.each([
    `https://${OFFICIAL_DOMAIN}`,
    `https://www.${OFFICIAL_DOMAIN}`,
    `https://app.${OFFICIAL_DOMAIN}`,
    `https://${OFFICIAL_DOMAIN}/workspace`,
    `https://staging.app.${OFFICIAL_DOMAIN}/`,
  ])('treats %s as official', (url) => {
    expect(isOfficialCloudServer(url)).toBe(true);
  });

  it.each([
    // A domain that merely ends with the official one must not pass — the
    // separator is what makes the suffix check safe.
    `https://${OFFICIAL_DOMAIN}.evil.example`,
    `https://not${OFFICIAL_DOMAIN}`,
    `https://my${OFFICIAL_DOMAIN.replaceAll('.', '-')}.internal`,
    'http://localhost:3210',
    'not a url',
    '',
    undefined,
  ])('treats %s as self-hosted', (url) => {
    expect(isOfficialCloudServer(url)).toBe(false);
  });
});
