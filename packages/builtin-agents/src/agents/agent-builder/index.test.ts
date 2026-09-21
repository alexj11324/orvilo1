import { AgentBuilderIdentifier } from '@orvilo/builtin-tool-agent-builder';
import { describe, expect, it } from 'vitest';

import { getAgentRuntimeConfig } from '../../index';
import { BUILTIN_AGENT_SLUGS } from '../../types';

const resolvePlugins = (plugins?: string[]) =>
  getAgentRuntimeConfig(BUILTIN_AGENT_SLUGS.agentBuilder, { plugins })?.plugins ?? [];

describe('AGENT_BUILDER runtime plugins', () => {
  it('always includes the Agent Builder tool', () => {
    expect(resolvePlugins()).toEqual([AgentBuilderIdentifier]);
  });

  it('strips conflicting agent-editing / orchestration tools', () => {
    const plugins = resolvePlugins([
      'orvilo-agent-management',
      'orvilo-group-management',
      'orvilo-group-agent-builder',
      'orvilo-agent',
    ]);

    expect(plugins).toEqual([AgentBuilderIdentifier]);
  });

  it('keeps functional plugins (web browsing, Gmail/Composio, etc.)', () => {
    const plugins = resolvePlugins([
      'orvilo-web-browsing',
      'orvilo-agent-documents',
      'gmail',
      'orvilo-agent-management', // conflicting → removed
    ]);

    expect(plugins).toEqual([
      AgentBuilderIdentifier,
      'orvilo-web-browsing',
      'orvilo-agent-documents',
      'gmail',
    ]);
  });
});
