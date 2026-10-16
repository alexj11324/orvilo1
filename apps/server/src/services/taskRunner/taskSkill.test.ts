import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { builtinSkills, TaskIdentifier } from '@orvilo/builtin-skills';
import { describe, expect, it } from 'vitest';

// The vitest config stubs `.md` imports to an empty string, so read the skill
// instructions straight from disk instead of through the package export.
const builtinSkillsEntry = createRequire(import.meta.url).resolve('@orvilo/builtin-skills');
const content = readFileSync(join(dirname(builtinSkillsEntry), 'task/SKILL.md'), 'utf8');

/**
 * TaskRunnerService auto-activates the task skill for every task run, so its
 * SKILL.md lands in the system context — a higher-priority surface than the
 * per-run task prompt. Operation tokens cannot use generic CLI endpoints;
 * guide the agent through its mounted tools and preserve human acceptance.
 */
describe('task skill instructions', () => {
  it('is mounted under the identifier the task runner auto-activates', () => {
    expect(builtinSkills.some((s) => s.identifier === TaskIdentifier)).toBe(true);
  });

  it('uses the mounted task MCP tools instead of generic CLI endpoints', () => {
    expect(content).toContain('orvilo_cc');
    for (const api of ['viewTask', 'listTasks', 'editTask', 'addTaskComment']) {
      expect(content).toContain(`orvilo-task__${api}`);
    }
    expect(content).not.toMatch(/orvilo (task|doc|file)\b|runCommand|readReference/);
  });

  it('keeps Issue completion behind review, human acceptance, and the real merge', () => {
    expect(content).toContain('confirmed Issue Checklist');
    expect(content).toContain('reviewer Agent');
    expect(content).toContain('human acceptance');
    expect(content).toContain('real merge controller');
    expect(content).toContain('Finishing this run does not mark the Issue Done');
    expect(content).toContain('NEVER set a terminal status on an automation task');
    expect(content).toContain('Only the user retires a recurring task');
  });

  it('only recommends document tools when mounted and distinguishes document identities', () => {
    expect(content).toContain('Only when Agent Documents tools are mounted');
    expect(content).toContain('orvilo-agent-documents__listDocuments');
    expect(content).toContain('binding `id`, not its `documentId`');
    expect(content).toContain('automatically attached to the current task');
    expect(content).toContain('Do not invent a file upload API');
  });
});
