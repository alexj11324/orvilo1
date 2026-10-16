import { promisify } from 'node:util';
import { zstdCompress, zstdDecompress } from 'node:zlib';

import type {
  IOrchestrationWorkflowTraceStore,
  OrchestrationWorkflowTraceSummary,
  OrchestrationWorkflowTrajectory,
} from '@orvilo/agent-tracing';
import { migrateOrchestrationWorkflowTraceData } from '@orvilo/agent-tracing';
import debug from 'debug';

import { FileS3 } from '@/server/modules/S3';

const compressZstd = promisify(zstdCompress);
const decompressZstd = promisify(zstdDecompress);

const log = debug('orvilo-server:orchestration-workflow-tracing:s3');

const TRACE_PREFIX = 'orchestration-workflow-traces';
const TRAJECTORY_SUFFIX = '.json.zst';
const ZSTD_CONTENT_TYPE = 'application/zstd';

/**
 * Canonical S3 key for a orchestration workflow's finalized trajectory. A orchestration workflow id is stable for
 * the life of the orchestration workflow, so the key is derivable from it alone — no column has
 * to carry it, the same way `parseOperationId` reconstructs an operation's key.
 */
export const buildOrchestrationWorkflowTraceKey = (orchestrationWorkflowId: string): string =>
  `${TRACE_PREFIX}/${orchestrationWorkflowId}${TRAJECTORY_SUFFIX}`;

/**
 * Where an in-progress trajectory lives. A long-horizon orchestration workflow is a partial for
 * nearly all of its life, so this is the object a reader wants most of the
 * time — the finalized key only exists once the orchestration workflow is terminal.
 */
export const buildOrchestrationWorkflowTracePartialKey = (
  orchestrationWorkflowId: string,
): string => `${TRACE_PREFIX}/_partial/${orchestrationWorkflowId}${TRAJECTORY_SUFFIX}`;

/**
 * S3-backed orchestration workflow trajectories.
 *
 * One object per orchestration workflow, accumulated through a partial exactly like an operation
 * snapshot. The read-modify-write per advance is the same trade the operation
 * store already makes per step: an advance costs seconds of coordinator work
 * and minutes of agent execution, so a compressed object round trip is noise.
 *
 * S3 paths:
 * - Final:   orchestration-workflow-traces/{orchestrationWorkflowId}.json.zst
 * - Partial: orchestration-workflow-traces/_partial/{orchestrationWorkflowId}.json.zst  (deleted on finalization)
 */
export class S3OrchestrationWorkflowTraceStore implements IOrchestrationWorkflowTraceStore {
  private readonly s3: FileS3;

  constructor() {
    this.s3 = new FileS3();
  }

  private partialKey(orchestrationWorkflowId: string): string {
    return buildOrchestrationWorkflowTracePartialKey(orchestrationWorkflowId);
  }

  private async encode(value: unknown): Promise<Buffer> {
    return compressZstd(Buffer.from(JSON.stringify(value)));
  }

  private async decode<T>(bytes: Uint8Array): Promise<T> {
    const buffer = await decompressZstd(Buffer.from(bytes));
    return migrateOrchestrationWorkflowTraceData(JSON.parse(buffer.toString('utf8'))) as T;
  }

  async save(trajectory: OrchestrationWorkflowTrajectory): Promise<void> {
    const key = buildOrchestrationWorkflowTraceKey(trajectory.orchestrationWorkflowId);
    log('saving orchestration workflow trajectory to S3: %s', key);
    await this.s3.uploadBuffer(key, await this.encode(trajectory), ZSTD_CONTENT_TYPE);
  }

  async get(orchestrationWorkflowId: string): Promise<OrchestrationWorkflowTrajectory | null> {
    try {
      return await this.decode<OrchestrationWorkflowTrajectory>(
        await this.s3.getFileByteArray(buildOrchestrationWorkflowTraceKey(orchestrationWorkflowId)),
      );
    } catch {
      // Existing database download pointers still address this immutable storage prefix.
      try {
        const trajectory = await this.decode<OrchestrationWorkflowTrajectory>(
          await this.s3.getFileByteArray(
            `goal-traces/${orchestrationWorkflowId}${TRAJECTORY_SUFFIX}`,
          ),
        );
        await this.save(trajectory);
        return trajectory;
      } catch {
        return null;
      }
    }
  }

  // Listing means scanning a prefix; the CLI resolves orchestration workflows through the
  // database instead, the same way it lists operations.
  async list(): Promise<OrchestrationWorkflowTraceSummary[]> {
    return [];
  }

  async listPartials(): Promise<string[]> {
    return [];
  }

  async loadPartial(
    orchestrationWorkflowId: string,
  ): Promise<Partial<OrchestrationWorkflowTrajectory> | null> {
    try {
      return await this.decode<Partial<OrchestrationWorkflowTrajectory>>(
        await this.s3.getFileByteArray(this.partialKey(orchestrationWorkflowId)),
      );
    } catch {
      try {
        const partial = await this.decode<Partial<OrchestrationWorkflowTrajectory>>(
          await this.s3.getFileByteArray(
            `goal-traces/_partial/${orchestrationWorkflowId}${TRAJECTORY_SUFFIX}`,
          ),
        );
        await this.savePartial(orchestrationWorkflowId, partial);
        return partial;
      } catch {
        return null;
      }
    }
  }

  async savePartial(
    orchestrationWorkflowId: string,
    partial: Partial<OrchestrationWorkflowTrajectory>,
  ): Promise<void> {
    await this.s3.uploadBuffer(
      this.partialKey(orchestrationWorkflowId),
      await this.encode(partial),
      ZSTD_CONTENT_TYPE,
    );
  }

  async removePartial(orchestrationWorkflowId: string): Promise<void> {
    await this.s3.deleteFile(this.partialKey(orchestrationWorkflowId)).catch(() => {});
    await this.s3
      .deleteFile(`goal-traces/_partial/${orchestrationWorkflowId}${TRAJECTORY_SUFFIX}`)
      .catch(() => {});
  }
}
