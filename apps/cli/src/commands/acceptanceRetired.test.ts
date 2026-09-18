import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { createProgram } from '../program';
import { registerVerifyCommand } from './verify';

/**
 * Regression guard for the standalone Acceptance / Verify platform retirement.
 *
 * `lh acceptance …` was a complete second product surface: it could create an
 * acceptance with no task or run behind it (`install`/`init` materialized the
 * portable skill, `run create` minted a standalone round, `ingest` published a
 * report from a directory). Every one of those is gone, and the `lh verify …`
 * spellings that aliased them are gone with it.
 */
/** The subcommands of the one `lh verify` group `registerVerifyCommand` builds. */
const verifyGroup = (): Command => {
  const program = new Command();
  registerVerifyCommand(program);

  const group = program.commands.find((command) => command.name() === 'verify');
  if (!group) throw new Error('lh verify was not registered');

  return group;
};

const subcommandNames = (command: Command): string[] =>
  command.commands.map((child) => child.name()).sort();

describe('retired acceptance command surface', () => {
  it('does not register a top-level `lh acceptance` group', () => {
    const program = createProgram();

    expect(program.commands.map((command) => command.name())).not.toContain('acceptance');
  });

  // `execute` stays: it runs the checks of the operation the caller is already
  // inside (`--operation`), so it cannot mint an unowned acceptance the way
  // `run create` / `ingest-report` could.
  it('does not register the retired `lh verify` subcommands', () => {
    expect(subcommandNames(verifyGroup())).toEqual(['criterion', 'execute', 'plan', 'rubric']);
  });

  it('does not reach the retired entry points through the criterion/rubric group', () => {
    const names = subcommandNames(verifyGroup());

    for (const retired of [
      'acceptance',
      'init',
      'install',
      'ingest-report',
      'run',
      'submit',
      'decision',
      'evidence',
      'report',
    ]) {
      expect(names, `lh verify ${retired} must not resolve`).not.toContain(retired);
    }
  });

  // `lh verify plan state` is quoted to the agent by the task prompt, and the
  // criterion / rubric commands read the same task-scoped rows the gating engine
  // uses — they are kept deliberately, which is why the assertion above is an
  // exact list rather than a "no acceptance-named command" filter.
  it('keeps the criterion / rubric / plan machinery the task runtime reads', () => {
    for (const kept of ['criterion', 'rubric', 'plan']) {
      expect(subcommandNames(verifyGroup())).toContain(kept);
    }
  });
});
