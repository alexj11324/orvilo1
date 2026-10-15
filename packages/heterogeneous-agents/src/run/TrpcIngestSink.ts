import type { LocalHeterogeneousAgentType } from '../index';
import type { AgentStreamEvent } from '../spawn';
import type { IngestSink } from './BatchIngester';

/** Producer labels the ingest contract admits beyond the scanned local
 * catalog — a device-hosted Prime run reports as 'orvilo'. */
export type IngestAgentType = LocalHeterogeneousAgentType | 'orvilo';

/**
 * The two server procedures the sink calls. Structural, so the CLI's tRPC
 * client and the desktop's in-process client both satisfy it without this
 * package depending on the server router types.
 */
export interface HeteroIngestClient {
  aiAgent: {
    heteroFinish: { mutate: (input: any) => Promise<unknown> };
    heteroIngest: { mutate: (input: any) => Promise<unknown> };
  };
}

/**
 * `IngestSink` implementation that forwards batches to the server via tRPC
 * (`aiAgent.heteroIngest` / `aiAgent.heteroFinish`).
 *
 * The CLI authenticates using the `ORVILO_JWT` env var (operation-scoped JWT
 * injected by the server before spawning the sandbox / desktop process).
 */
export class TrpcIngestSink implements IngestSink {
  constructor(
    private readonly client: HeteroIngestClient,
    private readonly agentType: IngestAgentType,
    private readonly operationId: string,
    private readonly topicId: string,
    private readonly assistantMessageId?: string,
    private readonly runGeneration?: number,
  ) {}

  async finish(params: Parameters<IngestSink['finish']>[0]): Promise<void> {
    const receipt = {
      agentType: this.agentType,
      assistantMessageId: this.assistantMessageId,
      operationId: this.operationId,
      runGeneration: this.runGeneration,
      topicId: this.topicId,
      ...params,
    };
    // A native process may exit while the backend is restarting. Retain this
    // exact terminal receipt until acknowledged; never launch the agent again.
    // Bounded, in-memory retry only: this does not survive killing the wrapper.
    for (let attempt = 0; ; attempt++) {
      try {
        await this.client.aiAgent.heteroFinish.mutate(receipt);
        return;
      } catch (error) {
        const code = (error as { data?: { code?: string } } | null)?.data?.code;
        if (
          attempt >= 6 ||
          (code && !['INTERNAL_SERVER_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE'].includes(code))
        )
          throw error;
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(500 * 2 ** attempt, 8000)),
        );
      }
    }
  }

  async ingest(events: AgentStreamEvent[]): Promise<void> {
    await this.client.aiAgent.heteroIngest.mutate({
      agentType: this.agentType,
      assistantMessageId: this.assistantMessageId,
      events: events as any,
      operationId: this.operationId,
      runGeneration: this.runGeneration,
      topicId: this.topicId,
    });
  }
}
