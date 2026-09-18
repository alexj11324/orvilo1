import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const associationPath = path.resolve(
  import.meta.dirname,
  '../../../../public/.well-known/apple-app-site-association',
);

interface AppleAppSiteAssociation {
  applinks?: { details?: { appIDs?: string[] }[] };
  webcredentials?: { apps?: string[] };
}

const raw = readFileSync(associationPath, 'utf8');
const readAssociation = (): AppleAppSiteAssociation => JSON.parse(raw);

// Universal links and web credentials are a security boundary: an entry in this
// file lets the listed app open this domain with no browser prompt and read the
// sign-in credentials this domain stored. This deployment ships no iOS app, so
// the file must stay empty — this suite is the regression guard that stops
// another vendor's app (the upstream `4684H589ZU.com.orvilo.app`) from being
// declared as an owner of this domain again.
describe('apple-app-site-association', () => {
  it('is valid JSON with the applinks and webcredentials containers', () => {
    const association = readAssociation();

    expect(Array.isArray(association.applinks?.details)).toBe(true);
    expect(Array.isArray(association.webcredentials?.apps)).toBe(true);
  });

  it('claims no app for this domain', () => {
    const association = readAssociation();

    expect(association.applinks?.details).toEqual([]);
    expect(association.webcredentials?.apps).toEqual([]);
  });

  it('names no third-party app identifier anywhere in the file', () => {
    // A universal-link app identifier is a 10-character Team ID followed by the
    // bundle id, e.g. 4684H589ZU.com.orvilo.app. Scanning the raw text catches
    // an identifier reintroduced under a different shape than `details`.
    expect(raw).not.toMatch(/\b[A-Z0-9]{10}(?:\.[A-Za-z0-9-]+)+/);
  });
});
