import { describe, expect, it } from 'vitest';

import {
  FAILURE_REASON_PREVIEW_LENGTH,
  isRunEndedBadly,
  runEndingFallbackKey,
  runEndingLabel,
  splitFailureReason,
} from './runEnding';

describe('splitFailureReason', () => {
  it('returns nothing for a missing or blank reason', () => {
    expect(splitFailureReason(undefined)).toBeNull();
    expect(splitFailureReason(null)).toBeNull();
    expect(splitFailureReason('  \n ')).toBeNull();
  });

  it('shows a short reason whole', () => {
    expect(splitFailureReason(' codex exited with code 1 ')).toEqual({
      full: 'codex exited with code 1',
      preview: 'codex exited with code 1',
      truncated: false,
    });
  });

  it('caps a long reason and keeps the rest available', () => {
    const reason = 'e'.repeat(FAILURE_REASON_PREVIEW_LENGTH + 500);
    const text = splitFailureReason(reason);
    expect(text?.truncated).toBe(true);
    expect(text?.preview).toBe(`${'e'.repeat(FAILURE_REASON_PREVIEW_LENGTH)}…`);
    expect(text?.full).toBe(reason);
  });

  it('passes markup through untouched as text rather than interpreting it', () => {
    const reason = '<img src=x onerror=alert(1)> [link](javascript:alert(1)) **bold**';
    expect(splitFailureReason(reason)?.preview).toBe(reason);
  });
});

describe('runEndingFallbackKey', () => {
  it('has a sentence for each bad ending and none for the rest', () => {
    expect(runEndingFallbackKey('timeout')).toBe('taskDetail.runEnded.timeout');
    expect(runEndingFallbackKey('canceled')).toBe('taskDetail.runEnded.canceled');
    expect(runEndingFallbackKey('failed')).toBe('taskDetail.runEnded.failedNoReason');
    expect(runEndingFallbackKey('completed')).toBeUndefined();
    expect(runEndingFallbackKey('running')).toBeUndefined();
    expect(runEndingFallbackKey(null)).toBeUndefined();
  });
});

describe('isRunEndedBadly', () => {
  it('is true only for failed, timed-out and stopped runs', () => {
    expect(['failed', 'timeout', 'canceled'].map(isRunEndedBadly)).toEqual([true, true, true]);
    expect(['completed', 'running', 'pending', undefined].map(isRunEndedBadly)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('runEndingLabel', () => {
  it('names the ending alone when no reason was recorded', () => {
    expect(runEndingLabel('Failed')).toBe('Failed');
    expect(runEndingLabel('Timed out', '  ')).toBe('Timed out');
  });

  it('appends a single-line head of the reason', () => {
    expect(runEndingLabel('Failed', 'codex exited\n  with code 1')).toBe(
      'Failed: codex exited with code 1',
    );
    expect(runEndingLabel('Failed', 'x'.repeat(500))).toBe(`Failed: ${'x'.repeat(120)}…`);
  });
});
