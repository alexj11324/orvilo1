import type { SubAgentTransport } from '@orvilo/agent-runtime';
import type {
  ExecSubAgentParams,
  ExecSubAgentResult,
  ExecVirtualSubAgentParams,
} from '@orvilo/types';

import type { RuntimeExecutorContext } from '../context';

const fallbackResult = (error: string): ExecSubAgentResult => ({
  assistantMessageId: '',
  error,
  operationId: '',
  success: false,
  threadId: '',
});

const shareGateBlockedResult = fallbackResult(
  'Sub-agent dispatch is not available for a shared-agent visitor run.',
);

/**
 * Server {@link SubAgentTransport} adapter — delegates child-run creation to
 * callbacks injected by AiAgentService while the package owns executor flow.
 */
export class ServerSubAgentTransport implements SubAgentTransport {
  constructor(private readonly ctx: RuntimeExecutorContext) {}

  async execSubAgent(params: ExecSubAgentParams): Promise<ExecSubAgentResult> {
    // Agent share (defensive layer): a share-visitor run's `ctx.agentShareVisitor` is
    // set from `state.principal.actor.shareVisitor` (see AgentRuntimeService) —
    // retained for visitor ops persisted before visitor execution was retired.
    // `callSubAgent`/`callAgent` children built via `execAgentThreadRun` don't
    // inherit the parent's share restrictions — they'd otherwise execute with
    // the CREATOR's full, unrestricted tool/file/memory surface. This is the
    // fail-closed backstop in case that surface is ever reached (e.g. a
    // stale/replayed tool call on a persisted visitor op).
    if (this.ctx.agentShareVisitor) return shareGateBlockedResult;
    if (!this.ctx.execSubAgent) return fallbackResult('Sub-agent dispatch is not available.');

    return this.ctx.execSubAgent(params);
  }

  async execVirtualSubAgent(params: ExecVirtualSubAgentParams): Promise<ExecSubAgentResult> {
    if (this.ctx.agentShareVisitor) return shareGateBlockedResult;
    if (!this.ctx.execVirtualSubAgent) {
      return fallbackResult('Virtual sub-agent dispatch is not available.');
    }

    return this.ctx.execVirtualSubAgent(params);
  }
}
