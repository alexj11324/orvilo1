import { describe, expect, it } from 'vitest';

import { OrviloAgentManifest } from './manifest';
import { resolveOrviloAgentManifest } from './resolveManifest';
import { systemPromptWithoutSubAgent } from './systemRole';
import { OrviloAgentApiName } from './types';

const apiNames = (manifest: { api: { name: string }[] }) => manifest.api.map((a) => a.name);

describe('resolveOrviloAgentManifest', () => {
  it('returns the full static manifest in a normal (main, non-sub-agent) turn', () => {
    const result = resolveOrviloAgentManifest({ scope: 'main' });

    // identical reference — no trimming, no clone
    expect(result).toBe(OrviloAgentManifest);
    expect(apiNames(result!)).toContain(OrviloAgentApiName.callSubAgent);
    // full prompt still describes sub-agent dispatch
    expect(result!.systemRole).toContain('callSubAgent');
  });

  it('returns the full manifest when no context signals are set', () => {
    expect(resolveOrviloAgentManifest({})).toBe(OrviloAgentManifest);
  });

  it.each(['group', 'group_agent'])(
    'hides callSubAgent in both api and systemRole (keeping plan/todo/visual) in scope %s',
    (scope) => {
      const result = resolveOrviloAgentManifest({ scope })!;

      const names = apiNames(result);
      expect(names).not.toContain(OrviloAgentApiName.callSubAgent);
      // the rest of orvilo-agent stays available
      expect(names).toContain(OrviloAgentApiName.createPlan);
      expect(names).toContain(OrviloAgentApiName.createTodos);
      expect(names).toContain(OrviloAgentApiName.analyzeMedia);
      // exactly one API removed
      expect(names).toHaveLength(OrviloAgentManifest.api.length - 1);

      // systemRole is rewritten so the prompt no longer mentions the hidden tool
      expect(result.systemRole).toBe(systemPromptWithoutSubAgent);
      expect(result.systemRole).not.toContain('callSubAgent');
      expect(result.systemRole).not.toContain('sub_agents');
      // plan/todo guidance survives in the rewritten prompt
      expect(result.systemRole).toContain('plan_and_todos');

      // non-api fields preserved
      expect(result.identifier).toBe(OrviloAgentManifest.identifier);
    },
  );

  it('hides callSubAgent (api + systemRole) inside a sub-agent run regardless of scope', () => {
    const result = resolveOrviloAgentManifest({ isSubAgent: true, scope: 'main' })!;

    expect(apiNames(result)).not.toContain(OrviloAgentApiName.callSubAgent);
    expect(apiNames(result)).toContain(OrviloAgentApiName.createPlan);
    expect(result.systemRole).not.toContain('callSubAgent');
  });

  it('does not mutate the original static manifest', () => {
    const before = OrviloAgentManifest.api.length;
    resolveOrviloAgentManifest({ scope: 'group' });
    expect(OrviloAgentManifest.api).toHaveLength(before);
    // the full manifest's systemRole still describes sub-agent dispatch
    expect(OrviloAgentManifest.systemRole).toContain('callSubAgent');
  });
});
