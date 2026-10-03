import { describe, expect, it } from 'vitest';

import { findRetiredAgencyConfigFields, normalizeAgencyConfigForWrite } from './agencyConfig';

describe('findRetiredAgencyConfigFields', () => {
  it('reports every retired heterogeneousProvider write field', () => {
    expect(
      findRetiredAgencyConfigFields({
        heterogeneousProvider: { adapterType: 'cli', engine: 'claude-sdk', type: 'orvilo' },
      }),
    ).toEqual(['heterogeneousProvider.adapterType', 'heterogeneousProvider.engine']);
  });

  it('reports only the retired fields that are present', () => {
    expect(
      findRetiredAgencyConfigFields({
        heterogeneousProvider: { engine: 'codex-app-server', type: 'orvilo' },
      }),
    ).toEqual(['heterogeneousProvider.engine']);
    expect(
      findRetiredAgencyConfigFields({
        heterogeneousProvider: { adapterType: 'cli', type: 'orvilo' },
      }),
    ).toEqual(['heterogeneousProvider.adapterType']);
  });

  it('reports nothing for clean, missing, or non-record shapes', () => {
    expect(
      findRetiredAgencyConfigFields({
        boundDeviceId: 'd1',
        heterogeneousProvider: { command: 'claude', type: 'orvilo' },
      }),
    ).toEqual([]);
    expect(findRetiredAgencyConfigFields({ heterogeneousProvider: 'nope' })).toEqual([]);
    expect(findRetiredAgencyConfigFields({})).toEqual([]);
    expect(findRetiredAgencyConfigFields(undefined)).toEqual([]);
    expect(findRetiredAgencyConfigFields(null)).toEqual([]);
    expect(findRetiredAgencyConfigFields('agencyConfig')).toEqual([]);
  });
});

describe('normalizeAgencyConfigForWrite', () => {
  it('strips retired fields while keeping the provider shape', () => {
    const normalized = normalizeAgencyConfigForWrite({
      boundDeviceId: 'device-a',
      heterogeneousProvider: {
        adapterType: 'cli',
        command: 'claude',
        engine: 'claude-sdk',
        type: 'orvilo',
      },
    } as any);

    expect(normalized.heterogeneousProvider).toEqual({
      command: 'claude',
      type: 'orvilo',
    });
    expect(normalized.boundDeviceId).toBe('device-a');
  });

  it('passes through configs without a legacy provider untouched', () => {
    const clean = {
      boundDeviceId: 'device-a',
      heterogeneousProvider: { command: 'claude', type: 'claude-code' },
    } as any;

    expect(normalizeAgencyConfigForWrite(clean)).toEqual(clean);
    expect(normalizeAgencyConfigForWrite(undefined)).toBeUndefined();
    // `?? undefined` collapses null the same way — nothing to normalize.
    expect(normalizeAgencyConfigForWrite(null)).toBeUndefined();
  });
});
