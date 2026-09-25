import debug from 'debug';

import type { AgentExecutionServiceDeps } from './types';

const log = debug('orvilo-server:operation-interrupt');

/**
 * Operation interruption (cancel bookkeeping).
 *
 * Split out of the legacy AgentRuntime facade: sets the interrupt sentinel
 * first (poller and step-boundary checks read only the sentinel), then marks
 * the persisted state `interrupted`. For remote/hetero ops the
 * InterventionController cancels the host task first (device gateway SIGINT);
 * this service writes the bookkeeping state for ops that still carry a state
 * snapshot.
 */
export class OperationInterruptService {
  private readonly stateManager: AgentExecutionServiceDeps['stateManager'];

  constructor(deps: AgentExecutionServiceDeps) {
    this.stateManager = deps.stateManager;
  }

  /**
   * Interrupt a running agent operation by setting its state to 'interrupted'.
   * Works with both Redis and InMemory state managers via the stateManager.
   *
   * @returns true if the operation was interrupted, false if already in a terminal state or not found
   */
  async interruptOperation(operationId: string): Promise<boolean> {
    const state = await this.stateManager.loadAgentState(operationId);
    if (!state) return false;

    if (state.status === 'done' || state.status === 'error' || state.status === 'interrupted') {
      return false;
    }

    // Sentinel FIRST: the poller and the step-boundary check read only the
    // sentinel, so it must become visible no later than the interrupted
    // state — otherwise a boundary check landing between the two writes
    // reads false and the following saveStepResult clobbers the
    // interruption. Writing it first also keeps failure atomic: if the
    // sentinel write throws, the state below is never marked either, so the
    // two never diverge. A sentinel that lands without the state save
    // (crash between the writes) only stops the op earlier than the record
    // shows — the step-boundary check then persists the interrupted state.
    await this.stateManager.markInterrupted(operationId);

    await this.stateManager.saveAgentState(operationId, {
      ...state,
      lastModified: new Date().toISOString(),
      status: 'interrupted',
    });

    log('[%s] Operation interrupted', operationId);
    return true;
  }
}
