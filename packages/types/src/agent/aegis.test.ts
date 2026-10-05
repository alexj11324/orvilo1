import { describe, expect, it } from 'vitest';

import {
  AEGIS_CLOSEOUT_SCHEMA,
  AEGIS_ORVILO_CONTRACT,
  AEGIS_PACK_ENV,
  isAegisMethodPackEnabled,
} from './aegis';

describe('isAegisMethodPackEnabled', () => {
  it('is opt-in only — undefined/absent config never enables', () => {
    expect(isAegisMethodPackEnabled(undefined)).toBe(false);
    expect(isAegisMethodPackEnabled(null)).toBe(false);
    expect(isAegisMethodPackEnabled({})).toBe(false);
    expect(isAegisMethodPackEnabled({ methodPacks: {} })).toBe(false);
    expect(isAegisMethodPackEnabled({ methodPacks: { aegis: false } })).toBe(false);
  });

  it('enables only on the explicit true bit', () => {
    expect(isAegisMethodPackEnabled({ methodPacks: { aegis: true } })).toBe(true);
  });
});

describe('AEGIS_ORVILO_CONTRACT', () => {
  it('documents the closeout contract the server-side gate evaluates', () => {
    expect(AEGIS_ORVILO_CONTRACT).toContain('.aegis/closeout.json');
    expect(AEGIS_ORVILO_CONTRACT).toContain(AEGIS_CLOSEOUT_SCHEMA);
    expect(AEGIS_ORVILO_CONTRACT).toContain('goalClosure');
    expect(AEGIS_ORVILO_CONTRACT).toContain('confidence');
  });
});

describe('AEGIS_PACK_ENV', () => {
  it('is the env bit the dispatch sets on orvilo hetero exec', () => {
    expect(AEGIS_PACK_ENV).toBe('ORVILO_AEGIS_PACK');
  });
});
