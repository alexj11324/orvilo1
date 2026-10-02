import { getBasename } from '@orvilo/builtin-tools/fileEditScan';
import type {
  AegisArtifactFile,
  WorkVersionCumulativeUsage,
  WorkVersionMetadata,
} from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import debug from 'debug';
import { sha256 } from 'js-sha256';

import type { WorkModel } from '@/database/models/work';
import type { FileService } from '@/server/services/file';

const log = debug('orvilo-server:aegis-work-registration');

export interface AegisWorksOutcome {
  /** Artifacts this completion tried to register. */
  attempted: number;
  /** How many of `attempted` did not end up registered this round. */
  failed: number;
  /** How many of `attempted` registered (or idempotently re-registered). */
  registered: number;
}

const AEGIS_ARTIFACT_MIME = 'application/json';
const AEGIS_TOOL_IDENTIFIER = 'aegis';
const AEGIS_TOOL_NAME = 'aegis-artifact-upload';

const collectArtifacts = (metadata: unknown): AegisArtifactFile[] => {
  if (!isRecord(metadata)) return [];
  const aegis = metadata.aegis;
  if (!isRecord(aegis) || aegis.enabled !== true || !Array.isArray(aegis.artifacts)) return [];
  return (aegis.artifacts as AegisArtifactFile[]).filter(
    (file): file is AegisArtifactFile =>
      isRecord(file) &&
      typeof file.path === 'string' &&
      file.path.length > 0 &&
      typeof file.content === 'string',
  );
};

/**
 * Persist the Aegis method-pack artifacts a hetero run shipped back in its
 * operation metadata (`metadata.aegis.artifacts` — the `.aegis/` closeout and
 * any drift/retirement reports, collected by `lh hetero exec` at finish) as
 * `file` Works on the task.
 *
 * Unlike entity-file Works there is NO sandbox export: the artifact bytes are
 * already server-side, uploaded verbatim to storage under a per-(operation,
 * path) immutable key, then registered through the same `registerFileWork`
 * path with dedup key `aegis:${operationId}:${path}` — one version per
 * operation, retry-idempotent via the same existence probe.
 *
 * Best-effort per artifact: failures are counted, never thrown, so a storage
 * or DB hiccup can never affect operation completion.
 */
export const registerAegisArtifactWorks = async (params: {
  agentId?: string | null;
  cumulativeCost: number | null;
  cumulativeUsage: WorkVersionCumulativeUsage | null;
  fileService: FileService;
  /** The run's final assistant message — the version's display anchor/provenance. */
  messageId?: string | null;
  /** `metadata` column of the completing `agent_operations` row. */
  metadata: unknown;
  operationId: string;
  threadId?: string | null;
  topicId: string;
  userId: string;
  workModel: WorkModel;
}): Promise<AegisWorksOutcome> => {
  const outcome: AegisWorksOutcome = { attempted: 0, failed: 0, registered: 0 };
  const artifacts = collectArtifacts(params.metadata);
  if (artifacts.length === 0) return outcome;

  for (const artifact of artifacts) {
    outcome.attempted += 1;
    const basename = getBasename(artifact.path);
    try {
      const toolCallId = `aegis:${params.operationId}:${artifact.path}`;
      const alreadyRegistered = await params.workModel.findFileVersionByToolCall({
        filePath: artifact.path,
        toolCallId,
        topicId: params.topicId,
        userId: params.userId,
      });
      if (alreadyRegistered) {
        outcome.registered += 1;
        continue;
      }

      // Same immutable-object rule as the sandbox export path: hash the full
      // operationId + path into the storage name so successive versions never
      // clobber each other's object.
      const now = Date.now();
      const today = new Date(now).toISOString().split('T')[0];
      const storageName = `${sha256(`${params.operationId}:${artifact.path}`).slice(0, 16)}-${basename}`;
      const key = `aegis-artifacts/${today}/${params.topicId}/${storageName}`;
      const buffer = Buffer.from(artifact.content, 'utf8');
      await params.fileService.uploadBuffer(key, buffer, AEGIS_ARTIFACT_MIME);

      const { fileId, url } = await params.fileService.createFileRecord({
        fileHash: sha256(key + now.toString()),
        fileType: AEGIS_ARTIFACT_MIME,
        name: basename,
        size: buffer.length,
        url: key,
      });

      const metadata: WorkVersionMetadata = {
        fileId,
        filePath: artifact.path,
        fileSize: buffer.length,
        fileUrl: url,
        linesAdded: 0,
        linesDeleted: 0,
        mimeType: AEGIS_ARTIFACT_MIME,
      };

      await params.workModel.registerFile({
        agentId: params.agentId,
        cumulativeCost: params.cumulativeCost,
        cumulativeUsage: params.cumulativeUsage,
        filePath: artifact.path,
        messageId: params.messageId,
        metadata,
        rootOperationId: params.operationId,
        threadId: params.threadId,
        title: basename,
        toolCallId,
        toolIdentifier: AEGIS_TOOL_IDENTIFIER,
        toolName: AEGIS_TOOL_NAME,
        topicId: params.topicId,
        userId: params.userId,
      });
      outcome.registered += 1;
    } catch (error) {
      outcome.failed += 1;
      log(
        '[%s] Failed to register aegis artifact %s (non-fatal): %O',
        params.operationId,
        artifact.path,
        error,
      );
    }
  }

  log(
    '[%s] Aegis artifact scan: attempted=%d registered=%d failed=%d',
    params.operationId,
    outcome.attempted,
    outcome.registered,
    outcome.failed,
  );
  return outcome;
};
