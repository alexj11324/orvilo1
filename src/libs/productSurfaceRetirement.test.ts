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
 * It guards retired entry points and producers while retaining historical readers
 * and the current Issue Checklist. The Issue #784 contract supersedes the former
 * requirement to retain the legacy completion engine and evidence writer.
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

      for (const file of [
        'apps/cli/src/commands/acceptanceFlow.ts',
        'apps/cli/src/commands/acceptanceRun.ts',
        'apps/cli/src/commands/verifyAcceptance.ts',
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

  describe('Issue Checklist and historical inspection survive', () => {
    it('keeps historical tool renderers without the executable evidence tool', () => {
      expect(exists('packages/builtin-tool-acceptance-evidence/src/manifest.ts')).toBe(true);
      expect(read('packages/builtin-tools/src/identifiers.ts')).not.toContain(
        'AcceptanceEvidenceManifest',
      );
      expect(read('packages/builtin-tools/src/register.ts')).toContain('GoalRenders');
    });

    it('keeps the Issue Checklist and rejects legacy verification writers', () => {
      expect(exists('apps/server/src/services/task/checklist.ts')).toBe(true);
      expect(read('apps/server/src/services/verify/retirement.ts')).toContain(
        "code: 'PRECONDITION_FAILED'",
      );
    });

    it('keeps the task-side acceptance panel', () => {
      for (const file of [
        'src/features/AgentTasks/AgentTaskDetail/TaskAcceptanceStateRow.tsx',
        'src/features/AgentTasks/AgentTaskDetail/useOpenAcceptanceInPanel.ts',
        'src/features/Portal/Acceptance/index.ts',
        'src/features/GlobalOverlays/AcceptancePortalDrawer.tsx',
      ]) {
        expect(exists(file), `${file} is gone`).toBe(true);
      }
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
