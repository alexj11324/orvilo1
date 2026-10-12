import { describe, expect, it } from 'vitest';

import {
  addsWithoutRow,
  createPropertyRevealState,
  reconcilePropertyReveal,
  revealProperty,
  settleOpening,
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

  it('opens the picker of the property that was just added', () => {
    const labels = revealProperty(createPropertyRevealState('T-1'), 'labels');
    expect(labels.opening).toBe('labels');

    const schedule = revealProperty(labels, 'schedule');
    expect(schedule.opening).toBe('schedule');
    // The earlier row stays for as long as this Issue is shown.
    expect([...schedule.keys]).toEqual(['labels', 'schedule']);
  });

  it('opens the picker once, and keeps the row afterwards', () => {
    const added = revealProperty(createPropertyRevealState('T-1'), 'labels');

    const settled = settleOpening(added);

    expect(settled.opening).toBeNull();
    expect(settled.keys.has('labels')).toBe(true);
    expect(settleOpening(settled)).toBe(settled);
  });

  it('does not open a picker on the next Issue', () => {
    const onA = revealProperty(createPropertyRevealState('T-1'), 'labels');

    expect(reconcilePropertyReveal(onA, 'T-2').opening).toBeNull();
  });

  it('adds a due date through its dialog, without an empty row', () => {
    expect(addsWithoutRow('dueDate')).toBe(true);
    expect(addsWithoutRow('labels')).toBe(false);
    expect(addsWithoutRow('blockedBy')).toBe(false);
  });
});
