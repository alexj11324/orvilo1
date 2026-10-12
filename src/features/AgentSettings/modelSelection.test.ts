// @vitest-environment node
import { buildHeteroExecArgs } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { applySavedModelSelection } from './modelSelection';

describe('saving a runtime model', () => {
  it('retains an explicit Default selection and removes the old CLI model flag', () => {
    const saved = applySavedModelSelection(
      { type: 'codex', model: 'gpt-5.2', args: ['--model', 'gpt-5.2'] },
      { model: 'default' },
    );
    expect(saved.model).toBe('default');
    expect(saved.type).toBe('codex');
    expect(buildHeteroExecArgs(saved) ?? []).not.toContain('--model');
  });
});
