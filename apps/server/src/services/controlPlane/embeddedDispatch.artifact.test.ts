// @vitest-environment node
/**
 * `defaultRunnerArtifact` must resolve a `runner.mjs` path without throwing —
 * the embedded-dispatch regression where a bundled server build had no
 * `import.meta.dirname` turned the resolution into a TypeError that left the
 * admitted operation `running` forever (the send's tRPC call 500s outside any
 * control-plane failure funnel). */
import { afterEach, describe, expect, it } from 'vitest';

import { defaultRunnerArtifact } from './embeddedDispatch';

describe('defaultRunnerArtifact', () => {
  afterEach(() => {
    delete process.env.ORVILO_PRIME_EMBEDDED_ARTIFACT;
  });

  it('honours ORVILO_PRIME_EMBEDDED_ARTIFACT when set', () => {
    process.env.ORVILO_PRIME_EMBEDDED_ARTIFACT = '/opt/pinned/runner.mjs';
    expect(defaultRunnerArtifact()).toBe('/opt/pinned/runner.mjs');
  });

  it('resolves a repo-relative runner.mjs candidate without throwing', () => {
    const artifact = defaultRunnerArtifact();
    expect(artifact).toMatch(/runner\.mjs$/);
    expect(artifact).not.toContain('undefined');
  });
});
