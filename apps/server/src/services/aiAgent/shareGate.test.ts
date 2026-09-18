import {
  AgentDocumentsApiName,
  AgentDocumentsIdentifier,
} from '@orvilo/builtin-tool-agent-documents';
import { AgentManagementIdentifier } from '@orvilo/builtin-tool-agent-management';
import { CalculatorIdentifier } from '@orvilo/builtin-tool-calculator';
import { KnowledgeBaseApiName, KnowledgeBaseIdentifier } from '@orvilo/builtin-tool-knowledge-base';
import { OrviloAgentApiName, OrviloAgentIdentifier } from '@orvilo/builtin-tool-orvilo-agent';
import { MemoryApiName, MemoryIdentifier } from '@orvilo/builtin-tool-memory';
import { TopicReferenceIdentifier } from '@orvilo/builtin-tool-topic-reference';
import {
  AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS,
  AGENT_SHARE_NO_DATA_GRANT_BUILTIN_IDENTIFIERS,
  builtinTools,
} from '@orvilo/builtin-tools';
import { describe, expect, it } from 'vitest';

import { isShareBlockedBuiltinDispatch, isShareBlockedDataToolCall } from './shareGate';

// Visitor EXECUTION is retired — `shareChat.execAgent` refuses before any work
// and no startup path can mint a new visitor run. What survives is the
// dispatch-time gate below: operations created before retirement still carry
// their `agentShareVisitor` marker, and every tool call they make while
// streaming/settling/finishing must keep clearing the same rules it was
// authorized under. These tests pin that retained enforcement.

describe('AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS', () => {
  it('only names identifiers that exist in the real builtin registry', () => {
    const registered = new Set(builtinTools.map((tool) => tool.identifier));

    for (const identifier of AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS) {
      expect(registered.has(identifier), `${identifier} is not a registered builtin`).toBe(true);
    }
  });

  it('does not allowlist the confirmed creator-data leak tools', () => {
    for (const identifier of [
      AgentManagementIdentifier,
      'lobe-local-system',
      'lobe-creds',
      'lobe-task',
      TopicReferenceIdentifier,
    ]) {
      expect(AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS.has(identifier)).toBe(false);
    }
  });
});

/**
 * The owner-facing share settings tool picker renders this set as permanently
 * unavailable. If a grant here is ever relaxed server-side without updating
 * the exported set, the UI would start offering a toggle the gate still
 * ignores — so pin the two together.
 */
describe('AGENT_SHARE_NO_DATA_GRANT_BUILTIN_IDENTIFIERS', () => {
  const maximalPermissions = { allowReadMemory: true, knowledgeBaseIds: ['kb1'] };

  it('names only allowlisted identifiers', () => {
    for (const identifier of AGENT_SHARE_NO_DATA_GRANT_BUILTIN_IDENTIFIERS) {
      expect(AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS.has(identifier)).toBe(true);
    }
  });

  it('matches exactly the allowlisted identifiers blocked under maximal permissions', () => {
    // `readOnlyApiName` stands in for any API: an unconditional `none` grant
    // blocks the identifier before the per-API rules are ever consulted.
    const blockedUnderMaximalPermissions = [...AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS].filter(
      (identifier) => isShareBlockedDataToolCall(maximalPermissions, identifier, 'readOnlyApiName'),
    );

    expect(new Set(blockedUnderMaximalPermissions)).toEqual(
      AGENT_SHARE_NO_DATA_GRANT_BUILTIN_IDENTIFIERS,
    );
  });

  it('excludes memory, whose grant is conditional on allowReadMemory', () => {
    expect(AGENT_SHARE_NO_DATA_GRANT_BUILTIN_IDENTIFIERS.has(MemoryIdentifier)).toBe(false);
  });
});

describe('isShareBlockedDataToolCall', () => {
  it('lets non-builtin identifiers through untouched', () => {
    expect(isShareBlockedDataToolCall({}, 'mcp-github', 'anything')).toBe(false);
  });

  it('default-denies any builtin outside the allowlist', () => {
    expect(isShareBlockedDataToolCall({}, AgentManagementIdentifier, 'searchAgent')).toBe(true);
  });

  it('allows an allowlisted builtin with no data rule', () => {
    expect(isShareBlockedDataToolCall({}, CalculatorIdentifier, 'calculate')).toBe(false);
  });

  describe('memory', () => {
    it('blocks every api without allowReadMemory', () => {
      expect(isShareBlockedDataToolCall({}, MemoryIdentifier, MemoryApiName.searchUserMemory)).toBe(
        true,
      );
    });

    it('allows reads but never writes with allowReadMemory', () => {
      const permissions = { allowReadMemory: true };

      expect(
        isShareBlockedDataToolCall(permissions, MemoryIdentifier, MemoryApiName.searchUserMemory),
      ).toBe(false);
      expect(
        isShareBlockedDataToolCall(permissions, MemoryIdentifier, MemoryApiName.addContextMemory),
      ).toBe(true);
    });
  });

  it('blocks agent documents and knowledge base outright (no grant exists)', () => {
    expect(
      isShareBlockedDataToolCall(
        { allowReadMemory: true },
        AgentDocumentsIdentifier,
        AgentDocumentsApiName.listDocuments,
      ),
    ).toBe(true);
    expect(
      isShareBlockedDataToolCall(
        { allowReadMemory: true, knowledgeBaseIds: ['kb1'] },
        KnowledgeBaseIdentifier,
        KnowledgeBaseApiName.viewKnowledgeBase,
        { id: 'kb1' },
      ),
    ).toBe(true);
  });
});

// Dispatch-time full gate, asserted against the REAL manifests: a call that
// bypassed assembly must clear the master allowlist, the owner's
// toolGrants picker, the UNSTRIPPED manifest's humanIntervention policy,
// and the data-tool rules — in that order, all fail-closed.
describe('isShareBlockedBuiltinDispatch', () => {
  it('blocks an allowlisted builtin the owner did not enable', () => {
    expect(isShareBlockedBuiltinDispatch({}, CalculatorIdentifier, 'evalExpression')).toBe(true);
  });

  it('passes an enabled builtin with no intervention semantics', () => {
    expect(
      isShareBlockedBuiltinDispatch(
        { toolGrants: [{ identifier: OrviloAgentIdentifier }] },
        OrviloAgentIdentifier,
        OrviloAgentApiName.analyzeMedia,
      ),
    ).toBe(false);
  });

  it("blocks 'required'- and 'always'-intervention APIs even on an enabled tool", () => {
    // createPlan is humanIntervention: 'required' in the real manifest — a
    // visitor run has no approver, so letting it reach the executor under
    // headless would silently auto-run it without its consent step. The
    // dispatch gate re-reads the unstripped manifest and blocks.
    for (const apiName of [OrviloAgentApiName.createPlan, OrviloAgentApiName.askUserQuestion]) {
      expect(
        isShareBlockedBuiltinDispatch(
          { toolGrants: [{ identifier: OrviloAgentIdentifier }] },
          OrviloAgentIdentifier,
          apiName,
        ),
      ).toBe(true);
    }
  });

  it('blocks sub-agent dispatch even on an enabled tool with no intervention config', () => {
    // callSubAgent carries no humanIntervention, so neither the intervention
    // check nor the data-tool rules would catch it — and the child run it
    // spawns does not inherit the parent's share restrictions. Must be
    // blocked by its dedicated dispatch rule.
    expect(
      isShareBlockedBuiltinDispatch(
        { toolGrants: [{ identifier: OrviloAgentIdentifier }] },
        OrviloAgentIdentifier,
        OrviloAgentApiName.callSubAgent,
      ),
    ).toBe(true);

    // Ops persisted before the lobe→orvilo rename carry the legacy identifier —
    // the dispatch block must catch those too.
    expect(
      isShareBlockedBuiltinDispatch(
        { toolGrants: [{ identifier: 'lobe-agent' }] },
        'lobe-agent',
        OrviloAgentApiName.callSubAgent,
      ),
    ).toBe(true);
  });

  it('still applies the data-tool rules after the enable check', () => {
    const enabled = { toolGrants: [{ identifier: MemoryIdentifier }] };

    expect(
      isShareBlockedBuiltinDispatch(enabled, MemoryIdentifier, MemoryApiName.searchUserMemory),
    ).toBe(true);
    expect(
      isShareBlockedBuiltinDispatch(
        { ...enabled, allowReadMemory: true },
        MemoryIdentifier,
        MemoryApiName.searchUserMemory,
      ),
    ).toBe(false);
    expect(
      isShareBlockedBuiltinDispatch(
        { ...enabled, allowReadMemory: true },
        MemoryIdentifier,
        MemoryApiName.addContextMemory,
      ),
    ).toBe(true);
  });

  it('ignores non-builtin identifiers entirely', () => {
    expect(isShareBlockedBuiltinDispatch({}, 'some-mcp-server', 'anything')).toBe(false);
  });

  it('blocks a builtin outside the master allowlist regardless of enablement', () => {
    expect(
      isShareBlockedBuiltinDispatch(
        { toolGrants: [{ identifier: AgentManagementIdentifier }] },
        AgentManagementIdentifier,
        'searchAgent',
      ),
    ).toBe(true);
  });

  it('a per-API grant grants only the named API, not the whole identifier', () => {
    const enabled = {
      toolGrants: [{ apis: [OrviloAgentApiName.analyzeMedia], identifier: OrviloAgentIdentifier }],
    };

    expect(
      isShareBlockedBuiltinDispatch(enabled, OrviloAgentIdentifier, OrviloAgentApiName.analyzeMedia),
    ).toBe(false);
    // updatePlan carries no intervention config either, so only the picker's
    // per-API scoping is what blocks it here.
    expect(
      isShareBlockedBuiltinDispatch(enabled, OrviloAgentIdentifier, OrviloAgentApiName.updatePlan),
    ).toBe(true);
  });
});
