/**
 * @vitest-environment node
 *
 * Structural gate for retiring the platform **Skill-management** product chain
 * (inventory HS-20 … HS-26 in `docs/development/hidden-surface-retirement.md`).
 *
 * It reads wiring files as text on purpose: the assertion is about the *shape of
 * the repository*, so a rebase, a cherry-pick or an upstream sync that quietly
 * restores the skill store fails here even though every runtime test still
 * passes.
 *
 * It is deliberately symmetric, because the same careless pass that removes the
 * store can also tear out the two things that must survive:
 *
 *   must be gone — the skill settings pages, the market/store features, the
 *                  create / import / update / delete procedures, the market
 *                  read queries, the `?skill=` deep link, `lh skill`
 *   must stay    — the whole Connector chain (which used to share the same
 *                  page), the builtin skills the runtime injects, and the
 *                  read-only skill APIs the agent runtime still resolves
 *                  through
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const exists = (relativePath: string) => existsSync(path.join(repoRoot, relativePath));

describe('the platform Skill management chain stays retired', () => {
  describe('the skill management surfaces are gone', () => {
    it('no longer ships the personal or workspace skill settings pages', () => {
      expect(exists('src/features/Settings/skill')).toBe(false);
      expect(exists('src/routes/(main)/[workspaceSlug]/settings/skill')).toBe(false);

      // The workspace connector route used to import the skill feature directly
      // (it bypassed the `Settings/connector` shim), so a partial delete there
      // would keep the skill page alive through the connector URL.
      const workspaceConnector = read(
        'src/routes/(main)/[workspaceSlug]/settings/connector/index.tsx',
      );
      expect(workspaceConnector).not.toContain('Settings/skill');
      expect(workspaceConnector).toContain('@/features/Settings/connector/ConnectorSettings');
    });

    it('no longer ships the skill store features', () => {
      expect(exists('src/features/SkillStore')).toBe(false);
      // The create/edit half went with the store; only the read-only viewer the
      // working sidebar still mounts is allowed to remain.
      expect(exists('src/features/AgentSkillEdit')).toBe(false);
    });

    it('no longer opens the skill store from the chat input or the agent profile', () => {
      for (const file of [
        'src/features/ChatInput/ActionBar/Tools/index.tsx',
        'src/features/ChatInput/ActionBar/Tools/useControls.tsx',
        'src/features/ProfileEditor/AgentTool.tsx',
      ]) {
        const source = read(file);
        expect(source, `${file} still opens the skill store`).not.toContain(
          'createSkillStoreModal',
        );
        expect(source, `${file} still lists market skills`).not.toContain('getMarketAgentSkills');
        expect(source, `${file} still lists user skills`).not.toContain('getUserAgentSkills');
        expect(source, `${file} still deletes skills`).not.toContain('deleteAgentSkill');
      }
    });

    it('no longer offers a ?skill= deep link and nothing navigates to the skill page', () => {
      // The producer used to be the create-agent modal's "installed skill" state,
      // which navigated to the page this campaign deleted.
      const modalProvider = read('src/features/HomeSidebar/Body/Agent/ModalProvider.tsx');
      expect(modalProvider).not.toContain('settings/skill');
      expect(modalProvider).not.toContain('onOpenSkills');

      expect(exists('src/features/HomeSidebar/hooks/agentSkillSuggestion.ts')).toBe(false);
      expect(read('src/features/HomeSidebar/hooks/useCreateModal.tsx')).not.toContain(
        'importFromMarket',
      );
    });

    it('no longer indexes the skill tab in settings search', () => {
      const items = read('src/features/SettingsSearch/items.ts');

      expect(items).not.toContain('SettingsTabs.Skill');
    });
  });

  describe('the skill write APIs are gone', () => {
    it('ships no mutation on the agentSkills router', () => {
      const router = read('apps/server/src/routers/lambda/agentSkills.ts');

      // create / update / delete / importFromGitHub / importFromUrl /
      // importFromZip / importFromMarket were the seven write procedures.
      expect(router).not.toContain('.mutation(');
      for (const procedure of [
        'create:',
        'update:',
        'delete:',
        'importFromGitHub:',
        'importFromUrl:',
        'importFromZip:',
        'importFromMarket:',
      ]) {
        expect(router, `${procedure} came back`).not.toContain(procedure);
      }
    });

    it('ships no client-side skill write path', () => {
      const service = read('src/services/skill/index.ts');

      for (const method of [
        'createSkill',
        'updateSkill',
        'deleteSkill',
        'importFromGitHub',
        'importFromUrl',
        'importFromZip',
        'importFromMarket',
      ]) {
        expect(service, `${method} came back`).not.toContain(method);
      }
    });

    it('no longer ships the server-side import implementation', () => {
      expect(exists('apps/server/src/services/skill/importer.ts')).toBe(false);
      expect(exists('apps/server/src/services/skill/parser.ts')).toBe(false);
    });

    it('no longer serves the market skill router', () => {
      expect(exists('apps/server/src/routers/lambda/market/skill.ts')).toBe(false);
      expect(read('apps/server/src/routers/lambda/market/index.ts')).not.toContain('skillRouter');
    });

    it('no longer ships the market skill catalogue service methods', () => {
      const marketService = read('apps/server/src/services/market/index.ts');

      for (const method of [
        'getSkillCategories',
        'getSkillComments',
        'getSkillDetail(',
        'getSkillRatingDistribution',
        'getSkillDownloadUrl',
        'downloadSkill',
      ]) {
        expect(marketService, `${method} came back`).not.toContain(method);
      }
    });

    it('no longer ships the skill-store builtin tool', () => {
      // Assert on the source tree rather than the bare directory: a leftover
      // `node_modules` from before the delete is a stale install, not a source.
      expect(exists('packages/builtin-tool-skill-store/src')).toBe(false);
      expect(exists('packages/builtin-tool-skill-store/package.json')).toBe(false);
      expect(read('packages/builtin-tools/src/identifiers.ts')).not.toContain('SkillStoreManifest');
      expect(exists('apps/server/src/services/toolExecution/serverRuntimes/skillStore.ts')).toBe(
        false,
      );
      expect(exists('src/store/tool/slices/builtin/executors/orvilo-skill-store.ts')).toBe(false);
    });

    it('no longer ships the lh skill command group', () => {
      expect(exists('apps/cli/src/commands/skill.ts')).toBe(false);
      expect(exists('apps/cli/src/commands/skill.test.ts')).toBe(false);
    });
  });

  describe('the Connector chain is untouched', () => {
    it('keeps the connector settings surface it was split out of', () => {
      expect(exists('src/features/Settings/connector/ConnectorSettings.tsx')).toBe(true);
      expect(exists('src/features/Settings/connector/features/ConnectorDetail/index.tsx')).toBe(
        true,
      );
      expect(exists('src/features/Settings/connector/features/ConnectorList.tsx')).toBe(true);
    });

    it('keeps the agent-scoped Composio connector store', () => {
      // Mis-filed in the inventory as "another skill store": it is the
      // agent-scoped Composio connector picker and has no skill-market content.
      for (const file of [
        'src/features/AgentSkillStore/index.tsx',
        'src/features/AgentSkillStore/Content.tsx',
        'src/features/AgentSkillStore/Item.tsx',
        'src/features/AgentSkillStore/useAgentComposioConnect.ts',
      ]) {
        expect(exists(file), `${file} is gone`).toBe(true);
      }
    });

    it('keeps the Orvilo / Composio OAuth connect hook', () => {
      expect(exists('src/features/Connectors/useSkillConnect.ts')).toBe(true);
    });

    it('keeps the MCP plugin detail agents panel and its relocated presentational pieces', () => {
      for (const file of [
        'src/features/MCPPluginDetail/Agents.tsx',
        'src/features/MCPPluginDetail/AgentItem.tsx',
        'src/features/MCPPluginDetail/VirtuosoLoading.tsx',
      ]) {
        expect(exists(file), `${file} is gone`).toBe(true);
      }
      expect(read('src/features/MCPPluginDetail/Agents.tsx')).not.toContain('SkillStore');
    });

    it('keeps the connector store slice', () => {
      expect(exists('src/store/tool/slices/connector/action.ts')).toBe(true);
      expect(read('src/store/tool/slices/connector/action.ts')).toContain(
        'fetchAgentBoundConnectors',
      );
    });
  });

  describe('the runtime skill capability is untouched', () => {
    it('keeps the builtin skills the runtime injects', () => {
      for (const file of [
        'packages/builtin-skills/src/task/index.ts',
        'packages/builtin-skills/src/artifacts/index.ts',
        'packages/builtin-skills/src/orvilo/index.ts',
        'packages/builtin-skills/src/manifests.ts',
      ]) {
        expect(exists(file), `${file} is gone`).toBe(true);
      }

      const index = read('packages/builtin-skills/src/index.ts');
      expect(index).toContain('TaskSkill');
      expect(index).toContain('ArtifactsSkill');
      expect(index).toContain('OrviloSkill');
    });

    it('keeps the skill activation builtin tool and its server runtime', () => {
      expect(exists('packages/builtin-tool-skills/src/manifest.ts')).toBe(true);
      expect(exists('apps/server/src/services/toolExecution/serverRuntimes/skills.ts')).toBe(true);
      expect(exists('apps/server/src/services/toolExecution/serverRuntimes/activator.ts')).toBe(
        true,
      );
    });

    it('keeps the read procedures the runtime resolves skills through', () => {
      const router = read('apps/server/src/routers/lambda/agentSkills.ts');

      for (const procedure of [
        'getById:',
        'getByIdWithZipUrl:',
        'getByIdentifier:',
        'getByName:',
        'list:',
        'listResources:',
        'readResource:',
      ]) {
        expect(router, `${procedure} is gone`).toContain(procedure);
      }
    });

    it('keeps the client readers that inline skill content into a run', () => {
      for (const file of [
        'src/services/chat/mecha/skillPreload.ts',
        'src/services/chat/mecha/skillEngineering.ts',
        'src/services/electron/desktopSkillRuntime.ts',
        'src/store/tool/slices/builtin/loadBuiltinSkills.ts',
        'src/store/tool/slices/agentSkills/action.ts',
      ]) {
        expect(exists(file), `${file} is gone`).toBe(true);
      }
    });

    it('keeps the resource reader the VFS skill mount uses', () => {
      expect(exists('apps/server/src/services/skill/resource.ts')).toBe(true);
      expect(
        exists('apps/server/src/services/agentDocumentVfs/mounts/skills/createSkillMount.ts'),
      ).toBe(true);
    });
  });
});
