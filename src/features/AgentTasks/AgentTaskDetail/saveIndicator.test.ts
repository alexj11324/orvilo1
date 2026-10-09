import { describe, expect, it } from 'vitest';

import { initialSaveIndicator, reduceSaveIndicator, SAVED_VISIBLE_MS } from './saveIndicator';

describe('reduceSaveIndicator', () => {
  it('goes saving -> saved -> idle once the display window expires', () => {
    let state = reduceSaveIndicator('idle', { status: 'saving', type: 'status' });
    expect(state).toBe('saving');
    state = reduceSaveIndicator(state, { status: 'saved', type: 'status' });
    expect(state).toBe('saved');
    state = reduceSaveIndicator(state, { type: 'expire' });
    expect(state).toBe('idle');
    expect(SAVED_VISIBLE_MS).toBe(2000);
  });

  it('keeps failed through an expire tick', () => {
    expect(reduceSaveIndicator('failed', { type: 'expire' })).toBe('failed');
  });

  it('leaves saving alone when a stale expire arrives', () => {
    expect(reduceSaveIndicator('saving', { type: 'expire' })).toBe('saving');
  });

  it('returns to saving on a new edit after a failure, then saved', () => {
    let state = reduceSaveIndicator('idle', { status: 'failed', type: 'status' });
    state = reduceSaveIndicator(state, { status: 'saving', type: 'status' });
    expect(state).toBe('saving');
    expect(reduceSaveIndicator(state, { status: 'saved', type: 'status' })).toBe('saved');
  });

  it('does not replay a stale saved on mount but keeps saving / failed', () => {
    expect(initialSaveIndicator('saved')).toBe('idle');
    expect(initialSaveIndicator('failed')).toBe('failed');
    expect(initialSaveIndicator('saving')).toBe('saving');
    expect(initialSaveIndicator('idle')).toBe('idle');
  });
});
