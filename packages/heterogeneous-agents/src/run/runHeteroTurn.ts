import type { AskUserBridge } from '../askUser/AskUserBridge';
import type { AgentPromptInput, UploadHeterogeneousImage } from '../spawn';
import type { PersistentAcpAgent } from '../spawn/persistentAcpAgent';
import type { HeteroFinishError } from './turnOutcome';
import type { HeteroIngestClient } from './TrpcIngestSink';

/** Server procedures an in-process run needs: ingest/finish plus the intervention long-poll. */
export interface HeteroRunClient {
  aiAgent: HeteroIngestClient['aiAgent'] & {
    waitInterventionResponse: {
      query: (input: { lastEventId: string; operationId: string }) => Promise<{
        events: Array<{ data: unknown }>;
        lastEventId: string;
      }>;
    };
  };
}

/** Where the runner gets the agent for each attempt. Implemented by the desktop pool. */
export interface HeteroTurnAgentSource {
  /**
   * Agent for this attempt. `fresh: true` (the resume retry) must discard any
   * live agent and start a new native session without resuming.
   */
  acquire: (params: { fresh: boolean; resumeSessionId?: string }) => Promise<PersistentAcpAgent>;
}

export interface RunHeteroTurnParams {
  agentType: string;
  agents: HeteroTurnAgentSource;
  assistantMessageId?: string;
  /**
   * The turn's AskUser bridge. The runner forwards its events into ingest and
   * long-polls `waitInterventionResponse` while a question is pending — the
   * same contract `hetero exec` uses.
   */
  bridge?: AskUserBridge;
  client: HeteroRunClient;
  /** Vendor command override, used only to classify process failures. */
  command?: string;
  log?: {
    error: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  /** Called with each attempt's agent once its turn started (pid registration). */
  onAgentStarted?: (agent: PersistentAcpAgent) => void;
  operationId: string;
  prompt: AgentPromptInput;
  resumeFallbackPrompt?: AgentPromptInput;
  resumeSessionId?: string;
  runGeneration?: number;
  /** Abort → interrupt the in-flight turn; the run finishes as `cancelled`. */
  signal?: AbortSignal;
  topicId: string;
  uploadImage?: UploadHeterogeneousImage;
}

export interface HeteroTurnResult {
  error?: HeteroFinishError;
  /** `heteroFinish` could not be delivered after retries. */
  finishDeliveryFailed: boolean;
  result: 'cancelled' | 'error' | 'success';
  resumeSessionInvalidated: boolean;
  sessionId?: string;
}

/**
 * Run one gateway operation in-process on a (possibly warm) persistent ACP
 * agent and report it to the server exactly as `orvilo hetero exec` does.
 * Never throws: every failure ends in a `heteroFinish` attempt and a result.
 */
export const runHeteroTurn = async (_params: RunHeteroTurnParams): Promise<HeteroTurnResult> => {
  throw new Error('runHeteroTurn: not implemented');
};
