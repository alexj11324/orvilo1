import { describe, expect, it } from 'vitest';

import { isCoordinatorDirty, isOpeningDirty } from './groupSettingsDirty';

describe('isOpeningDirty', () => {
  const stored = { openingMessage: 'Hi', openingQuestions: ['a', 'b'] };

  it('is clean when the drafts match what is stored', () => {
    expect(isOpeningDirty({ ...stored, opening: 'Hi', questions: 'a\nb' })).toBe(false);
  });

  it('is clean for an unset opening and empty drafts', () => {
    expect(isOpeningDirty({ opening: '', questions: '' })).toBe(false);
  });

  it('is dirty when the message or the questions change', () => {
    expect(isOpeningDirty({ ...stored, opening: 'Hello', questions: 'a\nb' })).toBe(true);
    expect(isOpeningDirty({ ...stored, opening: 'Hi', questions: 'a' })).toBe(true);
  });
});

describe('isCoordinatorDirty', () => {
  const coordinator = {
    agencyConfig: { heterogeneousProvider: { type: 'orvilo' } },
    model: 'm1',
    params: { orchestratorSourceAgentId: 'agt_1' },
    provider: 'p1',
    systemRole: 'be useful',
  } as never;
  const runtime = {
    agencyConfig: { heterogeneousProvider: { type: 'orvilo' } },
    model: 'm1',
    provider: 'p1',
  } as never;
  const base = { coordinator, prompt: 'be useful', runtime, selectedOrchestratorId: 'agt_1' };

  it('is clean when nothing changed', () => {
    expect(isCoordinatorDirty(base)).toBe(false);
  });

  it('is clean before the coordinator or runtime has loaded', () => {
    expect(isCoordinatorDirty({ ...base, coordinator: undefined })).toBe(false);
    expect(isCoordinatorDirty({ ...base, runtime: undefined })).toBe(false);
  });

  it('is dirty when the prompt, model or orchestrator changes', () => {
    expect(isCoordinatorDirty({ ...base, prompt: 'be brief' })).toBe(true);
    expect(
      isCoordinatorDirty({ ...base, runtime: { ...(runtime as object), model: 'm2' } as never }),
    ).toBe(true);
    expect(isCoordinatorDirty({ ...base, selectedOrchestratorId: 'agt_2' })).toBe(true);
  });
});
