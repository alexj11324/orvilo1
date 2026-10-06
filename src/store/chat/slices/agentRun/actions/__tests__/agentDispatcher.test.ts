import { describe, expect, it } from 'vitest';

import { selectRuntimeType } from '../dispatch/agentDispatcher';

const heteroProvider = { command: 'claude', type: 'claude-code' as const };
const apiHeteroProvider = {
  apiConfig: { model: 'claude-test', providerId: 'anthropic' },
  authMode: 'api' as const,
  command: 'claude',
  type: 'claude-code' as const,
};
const serverDefaultApiHeteroProvider = {
  apiConfig: { model: 'claude-sonnet', source: 'server-default' as const },
  authMode: 'api' as const,
  command: 'claude',
  type: 'claude-code' as const,
};
const codexApiHeteroProvider = {
  apiConfig: { model: 'gpt-test', providerId: 'openai' },
  authMode: 'api' as const,
  command: 'codex',
  type: 'codex' as const,
};
const remoteHeteroProvider = { type: 'openclaw' as const };
const remoteHeteroProviderHermes = { type: 'hermes' as const };

describe('selectRuntimeType', () => {
  describe('on web (isDesktop = false)', () => {
    const opts = { isDesktop: false };

    it('returns client when no signal is set', () => {
      expect(selectRuntimeType({ isGatewayMode: false }, opts)).toBe('client');
    });

    it('returns gateway when gateway mode is enabled', () => {
      expect(selectRuntimeType({ isGatewayMode: true }, opts)).toBe('gateway');
    });

    it('routes local heterogeneousProvider to gateway on web', () => {
      expect(
        selectRuntimeType({ heterogeneousProvider: heteroProvider, isGatewayMode: true }, opts),
      ).toBe('gateway');
      expect(
        selectRuntimeType({ heterogeneousProvider: heteroProvider, isGatewayMode: false }, opts),
      ).toBe('gateway');
    });

    it('routes remote platform agents (openclaw/hermes) to gateway on web', () => {
      expect(
        selectRuntimeType(
          { heterogeneousProvider: remoteHeteroProvider, isGatewayMode: false },
          opts,
        ),
      ).toBe('gateway');
      expect(
        selectRuntimeType(
          { heterogeneousProvider: remoteHeteroProviderHermes, isGatewayMode: false },
          opts,
        ),
      ).toBe('gateway');
    });
  });

  describe('on desktop (isDesktop = true)', () => {
    const opts = { isDesktop: true };

    it('returns gateway for unconfigured local CLI agents — pending target resolves server-side', () => {
      // An unset execution target resolves to `none` on every client now — the
      // viewing desktop never silently becomes the execution host. Interactive
      // surfaces persist an explicit `local` + boundDeviceId binding first
      // (device switcher mount default); a truly unconfigured hetero run goes
      // to Gateway where the server plan fails loudly with a pick-a-device
      // error.
      expect(
        selectRuntimeType({ heterogeneousProvider: heteroProvider, isGatewayMode: true }, opts),
      ).toBe('gateway');
      expect(
        selectRuntimeType({ heterogeneousProvider: heteroProvider, isGatewayMode: false }, opts),
      ).toBe('gateway');
    });

    it('routes remote platform agents (openclaw/hermes) to gateway even on desktop', () => {
      // openclaw and hermes use device gateway, not desktop subprocess — must not go to hetero
      expect(
        selectRuntimeType(
          { heterogeneousProvider: remoteHeteroProvider, isGatewayMode: false },
          opts,
        ),
      ).toBe('gateway');
      expect(
        selectRuntimeType(
          { heterogeneousProvider: remoteHeteroProviderHermes, isGatewayMode: false },
          opts,
        ),
      ).toBe('gateway');
    });

    it('falls back to gateway/client when no hetero provider', () => {
      expect(selectRuntimeType({ isGatewayMode: true }, opts)).toBe('gateway');
      expect(selectRuntimeType({ isGatewayMode: false }, opts)).toBe('client');
    });
  });

  it.each([false, true])('keeps local Prime on Gateway with workspace=%s', (isWorkspaceAgent) => {
    expect(
      selectRuntimeType(
        {
          boundDeviceId: 'verified-device',
          executionTarget: 'local',
          heterogeneousProvider: { type: 'orvilo' },
          isGatewayMode: false,
          isWorkspaceAgent,
        },
        { isDesktop: true },
      ),
    ).toBe('gateway');
  });

  it('does not inherit an IPC parent runtime for a Prime child', () => {
    expect(
      selectRuntimeType(
        {
          executionTarget: 'local',
          heterogeneousProvider: { type: 'orvilo' },
          isGatewayMode: false,
          parentRuntime: 'hetero',
        },
        { isDesktop: true },
      ),
    ).toBe('gateway');
  });

  describe('executionTarget routing for local CLI hetero', () => {
    it('allows Claude Code API mode only for Desktop local execution', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: apiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');

      expect(() =>
        selectRuntimeType(
          {
            executionTarget: 'sandbox',
            heterogeneousProvider: apiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toThrow(/Desktop local execution/);

      expect(() =>
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: apiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: false },
        ),
      ).toThrow(/Desktop local execution/);
    });

    it('allows the deployment-default API source only for Desktop local execution', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: serverDefaultApiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');

      expect(() =>
        selectRuntimeType(
          {
            executionTarget: 'sandbox',
            heterogeneousProvider: serverDefaultApiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toThrow(/Desktop local execution/);

      expect(() =>
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: serverDefaultApiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: false },
        ),
      ).toThrow(/Desktop local execution/);
    });

    it('applies the same Desktop-local guard to Codex provider binding', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: codexApiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');

      expect(() =>
        selectRuntimeType(
          {
            executionTarget: 'sandbox',
            heterogeneousProvider: codexApiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toThrow(/Desktop local execution/);
    });

    it.each(['client', 'gateway'] as const)(
      'rejects API mode inherited from the %s parent runtime',
      (parentRuntime) => {
        expect(() =>
          selectRuntimeType(
            {
              executionTarget: 'local',
              heterogeneousProvider: apiHeteroProvider,
              isGatewayMode: false,
              parentRuntime,
            },
            { isDesktop: true },
          ),
        ).toThrow(/Desktop local execution/);
      },
    );

    it("routes API mode inherited from a stale 'hetero' parent runtime to gateway", () => {
      // A persisted 'hetero' parentRuntime is a transport marker, not a live
      // target: the api-mode local guard still passes (the run stays on the
      // box), but the child can only be admitted through gateway.
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: apiHeteroProvider,
            isGatewayMode: false,
            parentRuntime: 'hetero',
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it.each(['client', 'gateway', 'hetero'] as const)(
      'rejects every %s parent runtime for API mode on web',
      (parentRuntime) => {
        expect(() =>
          selectRuntimeType(
            {
              executionTarget: 'local',
              heterogeneousProvider: apiHeteroProvider,
              isGatewayMode: false,
              parentRuntime,
            },
            { isDesktop: false },
          ),
        ).toThrow(/Desktop local execution/);
      },
    );

    it('routes to gateway when executionTarget = device on desktop', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'device',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it('routes to gateway even when the bound device IS this desktop (observability choice)', () => {
      // `device` vs `local` on the same machine is a user-facing semantic
      // choice, not a transport detail: gateway dispatch streams progress
      // through the server so other clients (mobile/web) can follow the run,
      // while `local` IPC is faster but desktop-session-only. NEVER collapse
      // `device(currentDeviceId)` into the in-process path.
      expect(
        selectRuntimeType(
          {
            boundDeviceId: 'this-desktop-device-id',
            executionTarget: 'device',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it('routes to gateway when executionTarget = sandbox on desktop', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'sandbox',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it('routes `local` to gateway even when the device socket is down — never an IPC spawn (FIX-C)', () => {
      // Socket state never changes the routing decision. With the socket down
      // the server's admission simply cannot reach this device, and the run
      // surfaces as a typed blocked/unknown result — the private IPC fallback
      // that used to spawn here is removed.
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it('routes desktop `local` through gateway — server dispatches back onto THIS device', () => {
      // Converged path: the server dispatches the run back onto THIS desktop
      // via agent_run_request → heteroIngest — the same admission + ledger
      // lifecycle every other surface uses, so web observes the run too.
      // There is no socket-state input: `deviceGatewayConnected` was removed
      // from RuntimeSelectionContext because connectivity is a reachability
      // fact for the server, not a routing signal for the client.
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it('routes workspace-agent `local` to gateway — admission decides, not the client (FIX-C)', () => {
      // Whether a member's personal desktop may execute a workspace run is an
      // authorization question the server admission answers (enrollment/grant
      // surfaced through a blocked result). The client never pre-decides it
      // by spawning the private IPC lifecycle.
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
            isWorkspaceAgent: true,
            workspaceScoped: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it('routes API-mode `local` to gateway — the exec stays on the same desktop', () => {
      // The provider binding resolves on the desktop either way; gateway
      // dispatch does not move credentials off the box, it only moves the
      // admission/ledger hop server-side.
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: apiHeteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });

    it('falls back to gateway when executionTarget = local on web (sandbox or bound device)', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: false },
        ),
      ).toBe('gateway');
    });

    it('keeps an unset executionTarget pending → gateway on every client', () => {
      // no viewer-derived default anymore: desktop does not silently take the
      // in-process `hetero` transport for an unconfigured agent either
      expect(
        selectRuntimeType(
          { heterogeneousProvider: heteroProvider, isGatewayMode: false },
          { isDesktop: true },
        ),
      ).toBe('gateway');
      expect(
        selectRuntimeType(
          { heterogeneousProvider: heteroProvider, isGatewayMode: false },
          { isDesktop: false },
        ),
      ).toBe('gateway');
    });
  });

  describe('workspaceScoped — unmerged shared configs never spawn in-process on the member desktop', () => {
    it('routes desktop local / unset targets to gateway for workspace-scoped configs', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
            workspaceScoped: true,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
      expect(
        selectRuntimeType(
          { heterogeneousProvider: heteroProvider, isGatewayMode: false, workspaceScoped: true },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });
  });

  describe('isWorkspaceAgent', () => {
    it("routes an author's workspace-agent `local` run to gateway", () => {
      // `isWorkspaceAgent` no longer unlocks an in-process spawn — it only
      // feeds the api-mode personal-provider guard.
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
            isWorkspaceAgent: true,
            workspaceScoped: false,
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');
    });
  });

  describe('parentRuntime override', () => {
    it('parentRuntime wins over every other signal', () => {
      expect(
        selectRuntimeType(
          {
            parentRuntime: 'client',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: true,
          },
          { isDesktop: true },
        ),
      ).toBe('client');

      expect(
        selectRuntimeType({ parentRuntime: 'gateway', isGatewayMode: false }, { isDesktop: false }),
      ).toBe('gateway');

      // A stale/forced 'hetero' never resurrects the retired IPC spawn — it
      // is coerced to the same admission the parent actually ran under.
      expect(
        selectRuntimeType({ parentRuntime: 'hetero', isGatewayMode: true }, { isDesktop: false }),
      ).toBe('gateway');
    });

    it("never returns 'hetero' for any routing outcome (FIX-C invariant)", () => {
      const contexts: Parameters<typeof selectRuntimeType>[0][] = [
        { isGatewayMode: false },
        { isGatewayMode: true },
        { isGatewayMode: false },
        { heterogeneousProvider: heteroProvider, isGatewayMode: false },
        { heterogeneousProvider: remoteHeteroProvider, isGatewayMode: false },
        {
          executionTarget: 'local',
          heterogeneousProvider: heteroProvider,
          isGatewayMode: false,
        },
        {
          executionTarget: 'local',
          heterogeneousProvider: heteroProvider,
          isGatewayMode: false,
          isWorkspaceAgent: true,
          workspaceScoped: false,
        },
        { isGatewayMode: false, parentRuntime: 'hetero' },
      ];
      for (const isDesktop of [false, true]) {
        for (const ctx of contexts) {
          expect(selectRuntimeType(ctx, { isDesktop })).not.toBe('hetero');
        }
      }
    });
  });
});
