import { describe, expect, it } from 'vitest';

import {
  sanitizedRuntimeEnvironment,
  unavailableProcessTreeSupervisor,
  verifiedIsolation,
} from './isolation';

describe('isolation admission', () => {
  it('constructs an explicit environment without inheriting credentials or loaders', () => {
    expect(
      sanitizedRuntimeEnvironment({ home: '/private/runtime/home', temp: '/private/runtime/tmp' }),
    ).toEqual({
      HOME: '/private/runtime/home',
      TMPDIR: '/private/runtime/tmp',
      LANG: 'en_US.UTF-8',
      PYTHONNOUSERSITE: '1',
    });
  });

  it('refuses launch and quiescence claims without an OS supervisor', async () => {
    expect(
      await unavailableProcessTreeSupervisor.launch({
        executable: '/runtime/prime',
        args: [],
        workspace: '/workspace',
        environment: {},
      }),
    ).toMatchObject({ ok: false, error: { code: 'isolation_unavailable' } });
    expect(await unavailableProcessTreeSupervisor.terminate('tree')).toMatchObject({
      ok: false,
      error: { code: 'not_quiescent' },
    });
  });

  it('rejects a supervisor with missing descendant process enforcement', () => {
    expect(
      verifiedIsolation({
        supervisorId: 'trusted',
        treeId: 'tree',
        enforced: true,
        filesystem: true,
        network: true,
        processes: false,
        sanitizedEnvironment: true,
        credentialsExcluded: true,
      }),
    ).toBe(false);
  });
});

describe('runtime isolation evidence validation', () => {
  const evidence = {
    supervisorId: 'trusted',
    treeId: 'tree',
    enforced: true,
    filesystem: true,
    network: true,
    processes: true,
    sanitizedEnvironment: true,
    credentialsExcluded: true,
  };

  it('accepts only complete boolean evidence from the trusted supervisor', () => {
    expect(verifiedIsolation(evidence)).toBe(true);
  });

  it.each([
    'enforced',
    'filesystem',
    'network',
    'processes',
    'sanitizedEnvironment',
    'credentialsExcluded',
  ])('rejects a truthy non-boolean %s instead of treating it as enforcement', (field) => {
    expect(verifiedIsolation({ ...evidence, [field]: 'false' })).toBe(false);
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { ...evidence, treeId: 1 },
    { ...evidence, supervisorId: ' ' },
  ])('rejects malformed supervisor output without throwing', (value) => {
    expect(verifiedIsolation(value)).toBe(false);
  });
});
