/**
 * @vitest-environment happy-dom
 */
import { alwaysOnToolIds, manualModeExcludeToolIds } from '@orvilo/builtin-tools';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UserToolsSection from './UserToolsSection';

// Regression for the profile "double display" bug: an agent-scoped connector
// (e.g. a Composio account bound to this agent) is pinned into `config.plugins`
// for runtime gating. It is rendered in the "Agent Tools" section above; it must
// NOT also be counted/shown in this base ("Workspace/User") section — where,
// lacking a base-dimension manifest, it rendered as an extra "uninstalled" chip
// and inflated the header count.

const mocks = vi.hoisted(() => ({
  toolState: {
    // connectorSelectors.agentConnectors(agentId) reads s.agentConnectors[agentId]
    agentConnectors: {} as Record<
      string,
      Array<{ agentId: string; id: string; identifier: string }>
    >,
    builtinTools: [] as Array<{
      hidden?: boolean;
      identifier: string;
      manifest: { api: never[]; identifier: string; meta: { title: string }; systemRole: string };
      type: 'builtin';
    }>,
    connectors: [] as unknown[],
  },
  agentConfig: { plugins: [] } as {
    chatConfig?: { skillActivateMode?: 'auto' | 'manual' };
    plugins: unknown[];
  },
}));

// Personal vs workspace only changes the label, not the count under test.
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'ws-1',
}));

// The chips themselves are rendered by AgentTool; stub it so this test isolates
// the header count wiring. The shared visibility predicate has focused coverage.
vi.mock('@/features/ProfileEditor/AgentTool', () => ({ default: () => null }));
vi.mock('@/features/ProfileEditor/PluginTag', () => ({ default: () => null }));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Text: ({ children }: { children: ReactNode }) => <span data-testid="label">{children}</span>,
}));
vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Text: ({ children }: { children: ReactNode }) => <span data-testid="label">{children}</span>,
}));

// Apply the real selectors against the mock state.
vi.mock('@/store/tool', () => ({
  useToolStore: (sel: (s: unknown) => unknown) => sel(mocks.toolState),
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (sel: (s: unknown) => unknown) => sel(undefined),
}));
vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: { getAgentConfigById: () => () => mocks.agentConfig },
}));

/**
 * The behaviour under test is "an always-on builtin is excluded from this count
 * in auto mode, and counted in manual mode because manual mode excludes it".
 * That needs a tool that is in BOTH lists, so the sample is pinned to the real
 * constants rather than to a literal: when the sample is retired the two
 * assertions below fail and say so, instead of the count silently flipping and
 * the tests failing with an unexplained `· 1`.
 *
 * This is not hypothetical — these two cases used to name `orvilo-skill-store`,
 * which the hidden-surface retirement deleted out of both lists. They kept
 * passing the manual case and started failing the auto one.
 */
const SAMPLE_BUILTIN_TOOL_ID = 'orvilo-activator';

const builtinToolState = (identifier: string) => ({
  hidden: true,
  identifier,
  manifest: { api: [], identifier, meta: { title: identifier }, systemRole: '' },
  type: 'builtin' as const,
});

const renderSection = () =>
  render(
    <UserToolsSection
      agentId="agent-1"
      copyMode={false}
      copying={false}
      selected={new Set()}
      toggleSelected={() => {}}
      onCancelCopy={() => {}}
      onConfirmCopy={() => {}}
    />,
  );

const labelText = () => screen.getByTestId('label').textContent;

describe('UserToolsSection — Workspace/User tool count', () => {
  beforeEach(() => {
    mocks.toolState.agentConnectors = {};
    mocks.toolState.builtinTools = [];
    mocks.toolState.connectors = [];
    mocks.agentConfig = { plugins: [] };
  });

  it('does not count an agent-owned connector identifier pinned in config.plugins', () => {
    // google-drive is pinned for the agent AND is an agent-owned connector row →
    // it belongs to the Agent Tools section, so this section's count must be 0.
    mocks.agentConfig = { plugins: [{ identifier: 'google-drive', mode: 'pinned' }] };
    mocks.toolState.agentConnectors = {
      'agent-1': [{ agentId: 'agent-1', id: 'c1', identifier: 'google-drive' }],
    };

    renderSection();

    expect(labelText()).toContain('· 0');
  });

  it('still counts a genuine base pinned tool that is not an agent connector', () => {
    mocks.agentConfig = {
      plugins: [
        { identifier: 'google-drive', mode: 'pinned' }, // agent-owned → excluded
        { identifier: 'some-user-plugin', mode: 'pinned' }, // base → counted
      ],
    };
    mocks.toolState.agentConnectors = {
      'agent-1': [{ agentId: 'agent-1', id: 'c1', identifier: 'google-drive' }],
    };

    renderSection();

    expect(labelText()).toContain('· 1');
  });

  it('does not count Web Browsing even when a legacy plugin entry is pinned', () => {
    mocks.agentConfig = {
      plugins: [
        { identifier: 'orvilo-web-browsing', mode: 'pinned' },
        { identifier: 'some-user-plugin', mode: 'pinned' },
      ],
    };
    mocks.toolState.builtinTools = [
      {
        hidden: true,
        identifier: 'orvilo-web-browsing',
        manifest: {
          api: [],
          identifier: 'orvilo-web-browsing',
          meta: { title: 'Web Browsing' },
          systemRole: '',
        },
        type: 'builtin',
      },
    ];

    renderSection();

    expect(labelText()).toContain('· 1');
  });

  it('uses a sample tool that still satisfies the invariant under test', () => {
    expect(alwaysOnToolIds).toContain(SAMPLE_BUILTIN_TOOL_ID);
    expect(manualModeExcludeToolIds).toContain(SAMPLE_BUILTIN_TOOL_ID);
  });

  it('does not count a pinned always-on builtin in auto activation mode', () => {
    mocks.agentConfig = {
      chatConfig: { skillActivateMode: 'auto' },
      plugins: [{ identifier: SAMPLE_BUILTIN_TOOL_ID, mode: 'pinned' }],
    };
    mocks.toolState.builtinTools = [builtinToolState(SAMPLE_BUILTIN_TOOL_ID)];

    renderSection();

    expect(labelText()).toContain('· 0');
  });

  it('counts a pinned always-on builtin in manual mode once manual mode excludes it', () => {
    mocks.agentConfig = {
      chatConfig: { skillActivateMode: 'manual' },
      plugins: [{ identifier: SAMPLE_BUILTIN_TOOL_ID, mode: 'pinned' }],
    };
    mocks.toolState.builtinTools = [builtinToolState(SAMPLE_BUILTIN_TOOL_ID)];

    renderSection();

    expect(labelText()).toContain('· 1');
  });
});
