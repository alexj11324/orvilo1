import { describe, expect, it } from 'vitest';

import {
  buildOrchestrationWorkflowRequirement,
  resolveOrchestrationWorkflowAttemptBudget,
  resolveOrchestrationWorkflowScheduleConfig,
} from './startOrchestrationWorkflowInput';

describe('buildOrchestrationWorkflowRequirement', () => {
  it('composes structured markdown the requirement document renders cleanly', () => {
    // The text is shown by the orchestration workflow page's markdown editor, so blocks separate
    // with blank lines while the numbered criteria stay one tight list, each
    // how-to-judge note on its own sub-line instead of a run-on parenthetical.
    const text = buildOrchestrationWorkflowRequirement(
      'Ship it',
      [
        { description: 'Runs locally', instruction: 'Run the demo script', title: 'Local run' },
        { title: 'Docs complete' },
      ],
      'End-to-end reproduction',
    );

    expect(text).toBe(
      [
        '## Ship it',
        '',
        '**Scope:** End-to-end reproduction',
        '',
        '**Acceptance criteria** — every one must be satisfied with concrete evidence:',
        '',
        '1. **Local run** — Runs locally  ',
        '   *How to judge:* Run the demo script',
        '2. **Docs complete**',
      ].join('\n'),
    );
  });
});

describe('resolveOrchestrationWorkflowAttemptBudget', () => {
  it('leaves the budget unset when the user cleared the field', () => {
    // The manifest documents `null` as "no user-specified cap". Folding it into
    // the default silently capped a supposedly uncapped orchestration workflow at three attempts.
    expect(resolveOrchestrationWorkflowAttemptBudget(null)).toBeUndefined();
    expect(resolveOrchestrationWorkflowAttemptBudget(undefined)).toBeUndefined();
  });

  it('clamps a chosen value to the supported range', () => {
    expect(resolveOrchestrationWorkflowAttemptBudget(1)).toBe(2);
    expect(resolveOrchestrationWorkflowAttemptBudget(4)).toBe(4);
    expect(resolveOrchestrationWorkflowAttemptBudget(99)).toBe(10);
  });
});

describe('resolveOrchestrationWorkflowScheduleConfig', () => {
  it('leaves the schedule unset when the user cleared the field', () => {
    expect(resolveOrchestrationWorkflowScheduleConfig(null)).toBeUndefined();
    expect(resolveOrchestrationWorkflowScheduleConfig(undefined)).toBeUndefined();
    expect(resolveOrchestrationWorkflowScheduleConfig('')).toBeUndefined();
  });

  it('normalizes a valid deadline to ISO-8601', () => {
    const config = resolveOrchestrationWorkflowScheduleConfig('2026-12-31T23:59:59Z');
    expect(config?.deadline).toBe('2026-12-31T23:59:59.000Z');
  });

  it('drops an unparseable deadline instead of storing it', () => {
    // A deadline that cannot be parsed would either never fire (silently no
    // budget) or fire immediately (silently paused orchestration workflow); both hide the
    // mistake from the user, so it never reaches the config.
    expect(resolveOrchestrationWorkflowScheduleConfig('not a date')).toBeUndefined();
  });
});
