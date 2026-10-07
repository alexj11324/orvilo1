import { describe, expect, it } from 'vitest';

import {
  DESCRIPTION_REFERENCE_SCHEMA,
  parseDescriptionReference,
  validateDescriptionReference,
  validateDescriptionReferenceNode,
} from './descriptionReference';

const origin = 'https://orvilo.example';

describe('description reference identity', () => {
  it('recognizes canonical PR identity without persisting preview metadata', () => {
    expect(
      parseDescriptionReference('https://github.com/acme/widgets/pull/7/files#diff', origin),
    ).toEqual({
      id: 'gh:github.com:acme:widgets:7',
      kind: 'pull-request',
      url: 'https://github.com/acme/widgets/pull/7',
    });
  });

  it.each([
    '/task/T-7',
    '/workspace/task/T-7/title-slug',
    '/agent/agt_7/task/T-7',
    '/workspace/agent/agt_7/task/T-7/title-slug',
  ])('recognizes the existing Issue route %s', (path) => {
    expect(parseDescriptionReference(`${origin}${path}`, origin)).toEqual({
      id: 'T-7',
      kind: 'issue',
      url: `${origin}${path}`,
    });
    expect(parseDescriptionReference(path, origin)?.id).toBe('T-7');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    '//github.com/acme/widgets/pull/7',
    'https://user:secret@github.com/acme/widgets/pull/7',
    'https://github.com.evil.test/acme/widgets/pull/7',
    'https://github.com:8443/acme/widgets/pull/7',
    'https://github.com/acme/widgets/pull/0',
    'https://github.com/acme/widgets/pull/9007199254740993',
    'https://github.com/acme/widgets/issues/7',
    'https://elsewhere.example/task/T-7',
    'https://user:secret@orvilo.example/task/T-7',
    '/task/T%2F7',
    '/task/T-7\u0000',
    '/task\\T-7',
  ])('does not turn an unrelated or unsafe URL into a reference: %s', (url) => {
    expect(parseDescriptionReference(url, origin)).toBeNull();
  });

  it('validates serialized identity against its URL, ignoring injected preview fields', () => {
    const reference = parseDescriptionReference('/task/T-7', origin)!;
    expect(validateDescriptionReference({ ...reference, title: 'Private title' }, origin)).toEqual(
      reference,
    );
    expect(validateDescriptionReference({ ...reference, id: 'T-8' }, origin)).toBeNull();
    expect(validateDescriptionReference({ ...reference, kind: 'pull-request' }, origin)).toBeNull();
    expect(validateDescriptionReference(null, origin)).toBeNull();
  });

  it('rejects an imported schema node whose toolbar/export URL differs from its payload', () => {
    const payload = parseDescriptionReference('https://github.com/acme/widgets/pull/7', origin)!;
    expect(
      validateDescriptionReferenceNode(
        {
          payload,
          schemaType: DESCRIPTION_REFERENCE_SCHEMA,
          url: 'https://evil.example',
        },
        origin,
      ),
    ).toBeNull();
    expect(
      validateDescriptionReferenceNode(
        {
          payload,
          schemaType: DESCRIPTION_REFERENCE_SCHEMA,
          url: 'javascript:alert(1)',
        },
        origin,
      ),
    ).toBeNull();
    expect(
      validateDescriptionReferenceNode(
        {
          payload,
          schemaType: DESCRIPTION_REFERENCE_SCHEMA,
          url: payload.url,
        },
        origin,
      ),
    ).toEqual(payload);
  });
});
