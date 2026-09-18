import { describe, expect, it } from 'vitest';

import {
  CursorAcpAdapter,
  CursorAdapter,
  DevinAcpAdapter,
  DroidAcpAdapter,
  GrokBuildAdapter,
  TraeAcpAdapter,
} from './adapters';
import { HETEROGENEOUS_AGENT_CONFIGS } from './config';
import { createAdapter, listAgentTypes, listLocalAgentTypes } from './registry';

describe('registry', () => {
  describe('createAdapter', () => {
    it.each(['amp', 'claude-code', 'codebuddy', 'codex', 'kimi-code', 'opencode', 'pi', 'qoder'])(
      'creates a parameterized TraeAcpAdapter for standard-ACP agent "%s"',
      (agentType) => {
        expect(createAdapter(agentType)).toBeInstanceOf(TraeAcpAdapter);
      },
    );

    it('creates a CursorAdapter for "cursor" (archived-trace parsing)', () => {
      expect(createAdapter('cursor')).toBeInstanceOf(CursorAdapter);
    });

    it('creates a CursorAcpAdapter for the native ACP runtime', () => {
      expect(createAdapter('cursor-acp')).toBeInstanceOf(CursorAcpAdapter);
    });

    it('creates a DroidAcpAdapter for Droid and its ACP runtime alias', () => {
      expect(createAdapter('droid')).toBeInstanceOf(DroidAcpAdapter);
      expect(createAdapter('droid-acp')).toBeInstanceOf(DroidAcpAdapter);
    });

    it('creates a DevinAcpAdapter for "devin"', () => {
      expect(createAdapter('devin')).toBeInstanceOf(DevinAcpAdapter);
    });

    it('creates a GrokBuildAdapter for "grok-build"', () => {
      expect(createAdapter('grok-build')).toBeInstanceOf(GrokBuildAdapter);
    });

    it('creates a TraeAcpAdapter for "trae"', () => {
      expect(createAdapter('trae')).toBeInstanceOf(TraeAcpAdapter);
    });

    it('throws for unknown agent type', () => {
      expect(() => createAdapter('unknown-agent')).toThrow('Unknown agent type: "unknown-agent"');
    });
  });

  describe('listAgentTypes', () => {
    it('registers exactly one local adapter for every descriptor', () => {
      expect(listLocalAgentTypes().toSorted()).toEqual(
        HETEROGENEOUS_AGENT_CONFIGS.map(({ type }) => type).toSorted(),
      );
      expect(listAgentTypes()).toContain('claude-code-sdk');
      expect(listAgentTypes()).toContain('cursor-acp');
      expect(listAgentTypes()).toContain('droid-acp');
    });
  });
});
