import { readFile } from 'node:fs/promises';

import type { OrchestrationWorkflowTrajectory } from '../types';
import { FileOrchestrationWorkflowTraceStore } from './file-store';
import { migrateOrchestrationWorkflowTraceData } from './migrateTraceData';
import { RemoteOrchestrationWorkflowTraceStore } from './remote-store';

export interface LoadOrchestrationWorkflowTrajectoryOptions {
  /** Fetch through `resolveDownloadUrl` when the orchestration workflow is not on disk. */
  allowDownload?: boolean;
  /**
   * Sign a download URL for a orchestration workflow id. There is no public fallback: unlike an
   * operation snapshot, whose key can be derived from its id, a orchestration workflow
   * trajectory is only reachable through the server, which looks the key up on
   * `orchestration_workflow_traces` and signs it for the caller's own scope.
   */
  resolveDownloadUrl?: (orchestrationWorkflowId: string) => Promise<string | null>;
  /** Root that `.orchestration-workflow-tracing/` resolves against. Defaults to `process.cwd()`. */
  rootDir?: string;
}

const isUrl = (target: string) => target.startsWith('http://') || target.startsWith('https://');

/**
 * Resolve one orchestration workflow trajectory from a CLI-style target: a `.json` path, an
 * http(s) URL, or a orchestration workflow id (local store → `_remote/` cache → optional
 * download).
 *
 * The local store already falls through to the in-progress partial, so a orchestration workflow
 * that is still running resolves without a special flag — for a long-horizon
 * orchestration workflow that is the normal case, not the exception.
 */
export async function loadOrchestrationWorkflowTrajectory(
  target: string,
  options: LoadOrchestrationWorkflowTrajectoryOptions = {},
): Promise<OrchestrationWorkflowTrajectory | undefined> {
  const { allowDownload = false, resolveDownloadUrl, rootDir } = options;

  if (target.endsWith('.json') && !isUrl(target)) {
    return migrateOrchestrationWorkflowTraceData(
      JSON.parse(await readFile(target, 'utf8')),
    ) as OrchestrationWorkflowTrajectory;
  }

  if (isUrl(target)) {
    const response = await fetch(target);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch orchestration workflow trajectory: ${response.status} ${response.statusText}`,
      );
    }
    return migrateOrchestrationWorkflowTraceData(
      await response.json(),
    ) as OrchestrationWorkflowTrajectory;
  }

  const local = await new FileOrchestrationWorkflowTraceStore(rootDir).get(target);
  if (local) return local;

  const remote = new RemoteOrchestrationWorkflowTraceStore(rootDir);
  // Cached copies are only written for finished orchestration workflows, but an older cache may
  // predate that rule, so an unfinished one is re-fetched rather than served.
  const cached = await remote.getCached(target);
  if (cached?.completionReason) return cached;

  if (!allowDownload) return undefined;

  const signedUrl = await resolveDownloadUrl?.(target);
  return signedUrl ? remote.fetch(signedUrl, target) : undefined;
}
