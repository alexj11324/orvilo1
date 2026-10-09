import { describe, expect, it } from 'vitest';

import {
  createPropertyRevealState,
  reconcilePropertyReveal,
  revealProperty,
} from './taskPropertyReveal';

describe('taskPropertyReveal', () => {
  it('records revealed keys for the Issue they were opened on', () => {
    const state = revealProperty(createPropertyRevealState('T-1'), 'dueDate');

    expect(reconcilePropertyReveal(state, 'T-1')).toBe(state);
    expect(state.keys.has('dueDate')).toBe(true);
  });

  it('does not carry a revealed key to another Issue', () => {
    const onA = revealProperty(createPropertyRevealState('T-1'), 'labels');

    const onB = reconcilePropertyReveal(onA, 'T-2');

    expect(onB.taskId).toBe('T-2');
    expect(onB.keys.size).toBe(0);
  });

  it('does not remember an Issue after leaving it', () => {
    const onA = revealProperty(createPropertyRevealState('T-1'), 'schedule');
    const onB = reconcilePropertyReveal(onA, 'T-2');

    const backOnA = reconcilePropertyReveal(onB, 'T-1');

    expect(backOnA.keys.size).toBe(0);
  });

  it('never mutates the previous state', () => {
    const base = createPropertyRevealState('T-1');
    const next = revealProperty(base, 'blocks');

    expect(base.keys.size).toBe(0);
    expect(next).not.toBe(base);
  });
});
