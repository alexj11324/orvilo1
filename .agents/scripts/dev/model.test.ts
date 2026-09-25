import { describe, expect, it } from 'vitest';

import {
  compareMigrations,
  databaseNameOf,
  parseCdpPort,
  parseLsofListeners,
  parseProcessEnv,
  pickEnvSource,
  readDotenvValue,
  rendererPortFor,
} from './model';

describe('parseLsofListeners', () => {
  it('pairs every address with its pid and dedupes IPv4/IPv6 twins', () => {
    const output = [
      'p65073',
      'cnode',
      'f13',
      'n*:3010',
      'f14',
      'n[::1]:3010',
      'p64631',
      'cElectron',
      'f34',
      'n127.0.0.1:9229',
    ].join('\n');

    expect(parseLsofListeners(output)).toEqual([
      { command: 'node', pid: 65_073, port: 3010 },
      { command: 'Electron', pid: 64_631, port: 9229 },
    ]);
  });
});

describe('parseProcessEnv', () => {
  it('returns only the requested keys, first occurrence wins', () => {
    const output =
      '/path/Electron . --remote-debugging-port=9229 PATH=/bin ELECTRON_RENDERER_URL=http://127.0.0.1:5180 ORVILO_DESKTOP_USER_DATA_DIR=/tmp/ud-7 ELECTRON_RENDERER_URL=http://x';

    expect(
      parseProcessEnv(output, ['ELECTRON_RENDERER_URL', 'ORVILO_DESKTOP_USER_DATA_DIR', 'MISSING']),
    ).toEqual({
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5180',
      ORVILO_DESKTOP_USER_DATA_DIR: '/tmp/ud-7',
    });
  });
});

describe('parseCdpPort', () => {
  it('reads the remote debugging port flag', () => {
    expect(parseCdpPort('Electron . --remote-debugging-port=9229')).toBe(9229);
    expect(parseCdpPort('Electron .')).toBeNull();
  });
});

describe('readDotenvValue', () => {
  it('reads a quoted or bare value and ignores other keys', () => {
    const content = '# comment\nDATABASE_URL_OLD=x\nDATABASE_URL="postgres://u@h/db"\n';
    expect(readDotenvValue(content, 'DATABASE_URL')).toBe('postgres://u@h/db');
    expect(readDotenvValue('A=1', 'DATABASE_URL')).toBeNull();
  });
});

describe('databaseNameOf', () => {
  it('returns only the database name, never credentials', () => {
    expect(
      databaseNameOf('postgres://user:secret@localhost:5432/orvilo_parity?sslmode=disable'),
    ).toBe('orvilo_parity');
    expect(databaseNameOf('not a url')).toBeNull();
  });
});

describe('rendererPortFor', () => {
  it('is stable per path and stays inside 5300–5899', () => {
    const a = rendererPortFor('/private/tmp/orvilo-parity-views');
    expect(rendererPortFor('/private/tmp/orvilo-parity-views')).toBe(a);
    for (const p of ['/a', '/b', '/private/tmp/x', '/Users/me/orvilo1']) {
      const port = rendererPortFor(p);
      expect(port).toBeGreaterThanOrEqual(5300);
      expect(port).toBeLessThan(5900);
    }
  });
});

describe('compareMigrations', () => {
  const journal = [
    { tag: '0187_a', when: 100 },
    { tag: '0188_b', when: 200 },
  ];

  it('is in sync when the newest applied migration is the journal tail', () => {
    expect(compareMigrations(journal, { count: 189, latest: 200 })).toEqual({
      applied: 189,
      kind: 'in-sync',
    });
  });

  it('lists journal entries newer than the database', () => {
    expect(compareMigrations(journal, { count: 188, latest: 100 })).toEqual({
      kind: 'pending',
      pending: ['0188_b'],
    });
  });

  it('flags a database migrated by a newer line than this worktree', () => {
    expect(compareMigrations(journal, { count: 190, latest: 300 })).toEqual({
      codeLatest: 200,
      dbLatest: 300,
      kind: 'db-ahead',
    });
  });
});

describe('pickEnvSource', () => {
  const inSync = { applied: 190, kind: 'in-sync' } as const;
  const pending = { kind: 'pending', pending: ['0190_x'] } as const;

  it('prefers a sibling whose database matches the code', () => {
    expect(
      pickEnvSource(
        [
          { root: '/wt/old', state: pending },
          { root: '/wt/parity', state: inSync },
        ],
        '/wt/backend',
      ),
    ).toEqual({ reason: 'matching-database', source: '/wt/parity' });
  });

  it('falls back to the backend owner when no database matches', () => {
    expect(pickEnvSource([{ root: '/wt/old', state: pending }], '/wt/backend')).toEqual({
      reason: 'backend-owner',
      source: '/wt/backend',
    });
  });

  it('returns null when nothing matches and no backend runs', () => {
    expect(pickEnvSource([{ root: '/wt/old', state: pending }], null)).toBeNull();
  });
});
