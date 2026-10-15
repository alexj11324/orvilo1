/**
 * @vitest-environment node
 *
 * Structural gate for the hidden-surface retirement.
 *
 * This is the anti-resurrection half of the campaign: every other test proves
 * the product *behaves* correctly today, but nothing stopped a later change —
 * a rebase, a cherry-pick, an upstream sync — from quietly bringing a retired
 * surface back. It reads the wiring files as text, which is deliberate: it is
 * asserting on the *shape of the repository*, not on runtime behaviour.
 *
 * The inherited engine, entries and distribution chain are removed together.
 * Ordinary Issue review and the runtime's unrelated skills remain available.
 * See `docs/development/issue-review.md` for the replacement flow.
 */
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

/**
 * `lstatSync`, not `existsSync`.
 *
 * Retiring a symlinked surface leaves a *dangling* link behind, and
 * `existsSync` follows links — it answers `false` for a link whose target is
 * gone, which is indistinguishable from the path never existing. `lstatSync`
 * stats the link itself, so a dangling `acceptance -> ../../…` entry is caught
 * instead of passing the gate that was written to catch it.
 */
const exists = (relativePath: string) =>
  lstatSync(path.join(repoRoot, relativePath), { throwIfNoEntry: false }) !== undefined;

describe('retired product surfaces stay retired', () => {
  describe('the standalone Acceptance / Verify platform', () => {
    it('no longer ships its workbench routes', () => {
      const routes = read('apps/workbench/app/routes.ts');

      expect(routes).not.toMatch(/route\('acceptance'/);
      expect(routes).not.toMatch(/route\('verify'/);
      expect(routes).not.toContain('acceptanceNamespace');
      expect(routes).not.toContain('verifyNamespace');
    });

    it('no longer ships its CLI command group', () => {
      const program = read('apps/cli/src/program.ts');

      expect(program).not.toContain('registerAcceptanceCommands');
      expect(program).not.toContain('registerVerifyCommands');

      for (const file of [
        'apps/cli/src/commands/acceptanceFlow.ts',
        'apps/cli/src/commands/acceptanceRun.ts',
        'apps/cli/src/commands/verifyAcceptance.ts',
        'apps/cli/src/commands/verify.ts',
        'apps/cli/src/commands/verifyHelpers.ts',
      ]) {
        expect(exists(file), `${file} is back`).toBe(false);
      }
    });

    it('no longer serves the public installation guide', () => {
      // This one was an unauthenticated route in the proxy, not just a static
      // asset: deleting the file without deleting the bypass would leave a
      // public path that nothing renders.
      const config = read('src/libs/next/proxy/define-config.ts');

      expect(config).not.toContain('/acceptance/skill.md');
      expect(exists('public/acceptance')).toBe(false);
    });
  });

  describe('the platform skill distribution chain', () => {
    it('no longer exports the pullable Acceptance skill', () => {
      const builtinSkills = read('packages/builtin-skills/src/index.ts');

      expect(builtinSkills).not.toContain('AcceptanceSkill');
      expect(builtinSkills).not.toContain('AcceptanceIdentifier');
      expect(exists('packages/builtin-skills/src/acceptance')).toBe(false);
    });

    it('no longer links the skill into a developer harness', () => {
      // `.agents/skills/acceptance` was a symlink into the package, so deleting
      // the target without deleting the link would leave a dangling entry that
      // a harness still tries to load.
      expect(exists('.agents/skills/acceptance')).toBe(false);
      expect(exists('apps/cli/src/utils/skillWiring.ts')).toBe(false);
      expect(read('apps/cli/src/program.ts')).not.toContain('skillWiring');
    });

    it('keeps the acceptance skill out of every manifest', () => {
      // The old exclusion was maintained in two independent places (the
      // `builtinSkills` array and `manifests.ts`), which is how it drifted.
      // With the skill deleted, neither may name it again.
      const manifests = read('packages/builtin-skills/src/manifests.ts');

      expect(manifests).not.toContain('Acceptance');
    });
  });

  describe('Issue review replaces the inherited engine', () => {
    it('removes the old verdict and evidence tool packages', () => {
      expect(exists('packages/builtin-tool-acceptance-evidence')).toBe(false);
      expect(exists('packages/builtin-tool-verify')).toBe(false);
      expect(read('packages/builtin-tools/src/identifiers.ts')).not.toContain(
        'AcceptanceEvidenceManifest',
      );
    });

    it('removes the old engine and tables', () => {
      for (const file of [
        'apps/server/src/services/verify',
        'packages/database/src/schemas/verify.ts',
        'packages/database/src/schemas/acceptanceComment.ts',
        'packages/database/src/schemas/acceptanceFlow.ts',
      ]) {
        expect(exists(file), `${file} is back`).toBe(false);
      }
    });

    it('removes the task-side acceptance panel', () => {
      for (const file of [
        'src/features/Acceptance',
        'src/features/AgentTasks/AgentTaskDetail/TaskAcceptanceStateRow.tsx',
        'src/features/AgentTasks/AgentTaskDetail/useOpenAcceptanceInPanel.ts',
        'src/features/Portal/Acceptance/index.ts',
        'src/features/GlobalOverlays/AcceptancePortalDrawer.tsx',
      ]) {
        expect(exists(file), `${file} is back`).toBe(false);
      }
    });

    it('keeps Agent review and the database reviewer rule', () => {
      expect(exists('apps/server/src/services/task/review.ts')).toBe(true);
      expect(read('packages/builtin-tool-task/src/manifest.ts')).toContain(
        'name: TaskApiName.submitTaskReview',
      );
      expect(read('packages/database/src/schemas/task.ts')).toContain(
        'tasks_in_review_reviewer_required',
      );
      expect(read('packages/database/src/schemas/task.ts')).toContain('reviewerAgentId');
    });

    it('keeps the builtin skills the runtime still injects', () => {
      for (const file of [
        'packages/builtin-skills/src/task/index.ts',
        'packages/builtin-skills/src/artifacts/index.ts',
        'packages/builtin-skills/src/orvilo/index.ts',
      ]) {
        expect(exists(file), `${file} is gone`).toBe(true);
      }
    });
  });
});
