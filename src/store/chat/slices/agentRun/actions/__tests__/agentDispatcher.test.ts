import { describe, expect, it } from 'vitest';

import { selectRuntimeType } from '../dispatch/agentDispatcher';

const heteroProvider = { command: 'claude', type: 'claude-code' as const };
const remoteHeteroProvider = { type: 'openclaw' as const };
const remoteHeteroProviderHermes = { type: 'hermes' as const };

describe('selectRuntimeType', () => {
  describe('on web (isDesktop = false)', () => {
    const opts = { isDesktop: false };

    it('throws AGENT_BINDING_REQUIRED when no signal is set', () => {
      expect(() => selectRuntimeType({ isGatewayMode: false }, opts)).toThrow(
        /AGENT_BINDING_REQUIRED/,
      );
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

    it('falls back to gateway / throws AGENT_BINDING_REQUIRED when no hetero provider', () => {
      expect(selectRuntimeType({ isGatewayMode: true }, opts)).toBe('gateway');
      expect(() => selectRuntimeType({ isGatewayMode: false }, opts)).toThrow(
        /AGENT_BINDING_REQUIRED/,
      );
    });
  });

  describe('executionTarget routing for local CLI hetero', () => {
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

    it('keeps hetero when executionTarget = local on desktop', () => {
      expect(
        selectRuntimeType(
          {
            executionTarget: 'local',
            heterogeneousProvider: heteroProvider,
            isGatewayMode: false,
          },
          { isDesktop: true },
        ),
      ).toBe('hetero');
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
    it('keeps subscription-auth workspace agents spawnable by their author', () => {
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
      ).toBe('hetero');
    });
  });

  describe('parentRuntime override', () => {
    it('parentRuntime wins over every other signal', () => {
      expect(
        selectRuntimeType(
          {
            heterogeneousProvider: heteroProvider,
            isGatewayMode: true,
            parentRuntime: 'gateway',
          },
          { isDesktop: true },
        ),
      ).toBe('gateway');

      expect(
        selectRuntimeType({ parentRuntime: 'gateway', isGatewayMode: false }, { isDesktop: false }),
      ).toBe('gateway');

      expect(
        selectRuntimeType({ parentRuntime: 'hetero', isGatewayMode: true }, { isDesktop: false }),
      ).toBe('hetero');
    });
  });
});
