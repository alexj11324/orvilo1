import { describe, expect, it } from 'vitest';

import {
  CursorAcpAdapter,
  CursorAdapter,
  DevinAcpAdapter,
  DroidAcpAdapter,
  GrokBuildAdapter,
  TraeAcpAdapter,
} from './adapters';
import { ClaudeCodeSdkAdapter } from './adapters/claudeCode';
import { HETEROGENEOUS_AGENT_CONFIGS } from './config';
import {
  createLiveAdapter,
  createTraceDecoder,
  listLiveAgentTypes,
  listLocalAgentTypes,
  listTraceDecoderTypes,
} from './registry';

describe('registry', () => {
  describe('createLiveAdapter', () => {
    it.each(['amp', 'claude-code', 'codebuddy', 'codex', 'kimi-code', 'opencode', 'pi', 'qoder'])(
      'creates a parameterized TraeAcpAdapter for standard-ACP agent "%s"',
      (agentType) => {
        expect(createLiveAdapter(agentType)).toBeInstanceOf(TraeAcpAdapter);
      },
    );

    it('creates a CursorAcpAdapter for the native ACP runtime', () => {
      expect(createLiveAdapter('cursor-acp')).toBeInstanceOf(CursorAcpAdapter);
    });

    it('creates a DroidAcpAdapter for Droid and its ACP runtime alias', () => {
      expect(createLiveAdapter('droid')).toBeInstanceOf(DroidAcpAdapter);
      expect(createLiveAdapter('droid-acp')).toBeInstanceOf(DroidAcpAdapter);
    });

    it('creates a DevinAcpAdapter for "devin"', () => {
      expect(createLiveAdapter('devin')).toBeInstanceOf(DevinAcpAdapter);
    });

    it('creates a GrokBuildAdapter for "grok-build"', () => {
      expect(createLiveAdapter('grok-build')).toBeInstanceOf(GrokBuildAdapter);
    });

    it('creates a TraeAcpAdapter for "trae"', () => {
      expect(createLiveAdapter('trae')).toBeInstanceOf(TraeAcpAdapter);
    });

    it('throws for unknown agent type', () => {
      expect(() => createLiveAdapter('unknown-agent')).toThrow(
        'Unknown agent type: "unknown-agent"',
      );
    });

    it.each(['cursor', 'claude-code-sdk'])(
      'rejects historical decoder "%s" for live sessions',
      (agentType) => {
        expect(() => createLiveAdapter(agentType)).toThrow('historical trace decoder');
      },
    );
  });

  describe('createTraceDecoder', () => {
    it('creates a CursorAdapter for "cursor" (archived-trace parsing)', () => {
      expect(createTraceDecoder('cursor')).toBeInstanceOf(CursorAdapter);
    });

    it('creates a ClaudeCodeSdkAdapter for "claude-code-sdk"', () => {
      expect(createTraceDecoder('claude-code-sdk')).toBeInstanceOf(ClaudeCodeSdkAdapter);
    });

    it('throws for live agent types and unknown keys', () => {
      expect(() => createTraceDecoder('claude-code')).toThrow('Unknown trace decoder');
      expect(() => createTraceDecoder('unknown-agent')).toThrow('Unknown trace decoder');
    });
  });

  describe('listLiveAgentTypes', () => {
    it('registers exactly one local adapter for every descriptor', () => {
      expect(listLocalAgentTypes().toSorted()).toEqual(
        HETEROGENEOUS_AGENT_CONFIGS.map(({ type }) => type).toSorted(),
      );
    });

    it('exposes only ACP transports — historical decoders are not listable', () => {
      expect(listLiveAgentTypes()).toContain('cursor-acp');
      expect(listLiveAgentTypes()).toContain('droid-acp');
      expect(listLiveAgentTypes()).not.toContain('cursor');
      expect(listLiveAgentTypes()).not.toContain('claude-code-sdk');
    });

    it('keeps live and decoder registries disjoint', () => {
      const overlap = listLiveAgentTypes().filter((t) => listTraceDecoderTypes().includes(t));
      expect(overlap).toEqual([]);
    });
  });
});
