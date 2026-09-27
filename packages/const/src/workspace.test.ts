import { describe, expect, it } from 'vitest';

import {
  isWorkspaceSlugFormatValid,
  slugifyWorkspaceName,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
  WORKSPACE_SLUG_PATTERN,
} from './workspace';

describe('workspace slug format', () => {
  it.each(['foo', 'foo-bar', 'a1', 'admin', '1-2-3'])('accepts %s', (slug) => {
    expect(isWorkspaceSlugFormatValid(slug)).toBe(true);
  });

  it.each(['-foo', 'foo-', 'Foo', 'foo_bar', 'foo bar', 'foo.bar', '', '中文', '@foo'])(
    'rejects %s',
    (slug) => {
      expect(isWorkspaceSlugFormatValid(slug)).toBe(false);
    },
  );

  // Length is enforced by the callers' zod schema, not by the pattern.
  it('does not enforce length', () => {
    expect(isWorkspaceSlugFormatValid('a')).toBe(true);
    expect(isWorkspaceSlugFormatValid('a'.repeat(WORKSPACE_SLUG_MAX + 1))).toBe(true);
    expect(WORKSPACE_SLUG_MIN).toBeLessThan(WORKSPACE_SLUG_MAX);
    expect(WORKSPACE_SLUG_PATTERN.test('a'.repeat(WORKSPACE_SLUG_MIN))).toBe(true);
  });
});

describe('slugifyWorkspaceName', () => {
  it.each([
    ['My Team', 'my-team'],
    ['vfsgn', 'vfsgn'],
    ['  Acme   Corp  ', 'acme-corp'],
    ['Tom & Jerry!', 'tom-jerry'],
    ['Orvilo_2.0', 'orvilo-2-0'],
  ])('derives %s → %s', (name, slug) => {
    expect(slugifyWorkspaceName(name)).toBe(slug);
  });

  it('never emits a pattern-invalid slug and caps at WORKSPACE_SLUG_MAX', () => {
    const derived = slugifyWorkspaceName(`${'Long '.repeat(12)}Workspace-Name!!`);
    expect(derived.length).toBeLessThanOrEqual(WORKSPACE_SLUG_MAX);
    expect(derived).toMatch(WORKSPACE_SLUG_PATTERN);
  });

  it('does not leave a dangling hyphen at the length cut', () => {
    // The hyphen lands exactly on the slice boundary.
    const derived = slugifyWorkspaceName(`${'a'.repeat(WORKSPACE_SLUG_MAX - 1)} rest`);
    expect(derived.endsWith('-')).toBe(false);
    expect(derived).toMatch(WORKSPACE_SLUG_PATTERN);
  });

  it('returns empty when the name carries no usable characters', () => {
    expect(slugifyWorkspaceName('中文工作区')).toBe('');
    expect(slugifyWorkspaceName('   ')).toBe('');
  });
});
