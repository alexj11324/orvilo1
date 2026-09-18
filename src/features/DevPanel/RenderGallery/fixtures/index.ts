'use client';

import { builtinTools } from '@orvilo/builtin-tools';
import { DEFAULT_INBOX_AVATAR } from '@orvilo/const';
import type { BuiltinToolManifest, OrviloPluginApi } from '@orvilo/types';

import type { ToolRenderFixture } from '../lifecycleMode';
import { buildSchemaSample, humanize, single, type ToolsetFixtureModule } from './_helpers';
import claudeCode from './claude-code';
import codex from './codex';
import github from './github';
import kimiCode from './kimi-code';
import linear from './linear';
import orviloActivator from './orvilo-activator';
import orviloAgent from './orvilo-agent';
import orviloAgentBuilder from './orvilo-agent-builder';
import orviloAgentDocuments from './orvilo-agent-documents';
import orviloAgentManagement from './orvilo-agent-management';
import orviloBrowser from './orvilo-browser';
import orviloCloudSandbox from './orvilo-cloud-sandbox';
import orviloGroupAgentBuilder from './orvilo-group-agent-builder';
import orviloGroupManagement from './orvilo-group-management';
import orviloImageGeneration from './orvilo-image-generation';
import orviloKnowledgeBase from './orvilo-knowledge-base';
import orviloLocalSystem from './orvilo-local-system';
import orviloNotebook from './orvilo-notebook';
import orviloPageAgent from './orvilo-page-agent';
import orviloSkills from './orvilo-skills';
import orviloTask from './orvilo-task';
import orviloUserInteraction from './orvilo-user-interaction';
import orviloUserMemory from './orvilo-user-memory';
import orviloWebBrowsing from './orvilo-web-browsing';
import orviloWebOnboarding from './orvilo-web-onboarding';
import { orviloAuv } from './orviloAuv';

export type { ToolRenderFixture, ToolRenderFixtureVariant } from '../lifecycleMode';

export interface ToolRenderMeta {
  api?: OrviloPluginApi;
  apiName: string;
  description?: string;
  identifier: string;
  toolsetDescription?: string;
  toolsetName: string;
}

export const DEVTOOLS_GROUP_ID = 'devtools-preview-group';

/**
 * Identity for the seeded Aggregate-preview conversation. The fixture messages
 * resolve their avatar/name through this agentId, so seeding `agentMap` with
 * this meta makes the preview turn read as "Orvilo AI" instead of the
 * unresolved-agent fallback ("Unnamed Assistant").
 */
export const DEVTOOLS_AGENT_ID = 'devtools-render-gallery';

export const DEVTOOLS_AGENT_META = {
  avatar: DEFAULT_INBOX_AVATAR,
  title: 'Orvilo AI',
};

export const DEVTOOLS_GROUP_DETAIL = {
  agents: [
    {
      avatar: '🧭',
      backgroundColor: '#E8F3FF',
      id: 'researcher-agent',
      title: 'Researcher',
    },
    {
      avatar: '🛠',
      backgroundColor: '#FFF3E8',
      id: 'builder-agent',
      title: 'Builder',
    },
  ],
  avatar: '👥',
  backgroundColor: '#EEF2FF',
  description: 'Fixture group used by /devtools to preview grouped task renders.',
  id: DEVTOOLS_GROUP_ID,
  title: 'Devtools Preview Group',
};

const toolsetModules: ToolsetFixtureModule[] = [
  claudeCode,
  codex,
  github,
  kimiCode,
  linear,
  orviloActivator,
  orviloAgent,
  orviloAgentBuilder,
  orviloAgentDocuments,
  orviloAgentManagement,
  orviloAuv,
  orviloBrowser,
  orviloCloudSandbox,
  orviloGroupAgentBuilder,
  orviloGroupManagement,
  orviloImageGeneration,
  orviloKnowledgeBase,
  orviloLocalSystem,
  orviloNotebook,
  orviloPageAgent,
  orviloSkills,
  orviloTask,
  orviloUserInteraction,
  orviloUserMemory,
  orviloWebBrowsing,
  orviloWebOnboarding,
];

const fixtureRegistry = new Map<string, ToolRenderFixture>();
const customToolsets = new Map<string, ToolsetFixtureModule>();

for (const toolset of toolsetModules) {
  customToolsets.set(toolset.identifier, toolset);
  for (const [apiName, fixture] of Object.entries(toolset.fixtures)) {
    fixtureRegistry.set(`${toolset.identifier}:${apiName}`, fixture);
  }
}

const manifestByIdentifier = new Map<string, BuiltinToolManifest>(
  builtinTools.map((tool) => [tool.identifier, tool.manifest]),
);

export const getToolRenderFixture = (
  identifier: string,
  apiName: string,
  api?: OrviloPluginApi,
): ToolRenderFixture => {
  const fixture = fixtureRegistry.get(`${identifier}:${apiName}`);
  if (fixture) return fixture;

  return single({
    args: buildSchemaSample(api?.parameters, apiName) || {},
  });
};

export const getToolRenderMeta = (identifier: string, apiName: string): ToolRenderMeta => {
  const manifest = manifestByIdentifier.get(identifier);
  const api = manifest?.api.find((item) => item.name === apiName);
  const customToolset = customToolsets.get(identifier);
  const customApi = customToolset?.apiList?.find((item) => item.name === apiName);

  return {
    api,
    apiName,
    description: api?.description || customApi?.description,
    identifier,
    toolsetDescription: manifest?.meta.description || customToolset?.meta?.description,
    toolsetName: manifest?.meta.title || customToolset?.meta?.title || humanize(identifier),
  };
};
