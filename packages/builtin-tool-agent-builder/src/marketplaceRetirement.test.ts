import { describe, expect, it } from 'vitest';

import { AgentManagementManifest } from '../../builtin-tool-agent-management/src/manifest';
import { GroupAgentBuilderManifest } from '../../builtin-tool-group-agent-builder/src/manifest';
import { WebOnboardingManifest } from '../../builtin-tool-web-onboarding/src/manifest';
import { AgentBuilderManifest } from './manifest';

describe('retired Marketplace tool surface', () => {
  it.each([AgentBuilderManifest, AgentManagementManifest, GroupAgentBuilderManifest])(
    '$identifier exposes no Marketplace search or installation API',
    (manifest) => {
      const names = manifest.api.map((api) => api.name);
      expect(names).not.toContain('searchMarketTools');
      expect(names).not.toContain('installPlugin');
    },
  );

  it('searches workspace agents with pagination and no catalog parameters', () => {
    const search = AgentManagementManifest.api.find((api) => api.name === 'searchAgent')!;
    expect(Object.keys(search.parameters.properties!)).toEqual(['keyword', 'limit', 'offset']);
  });

  it('finishes onboarding without an agent installation picker', () => {
    expect(WebOnboardingManifest.api.map((api) => api.name)).toEqual([
      'saveUserQuestion',
      'finishOnboarding',
      'readDocument',
      'writeDocument',
      'updateDocument',
    ]);
  });

  it('keeps the builtin configuration toggle', () => {
    const update = AgentBuilderManifest.api.find((api) => api.name === 'updateConfig')!;
    expect(update.parameters.properties).toHaveProperty('togglePlugin');
  });
});
