/**
 * Process-independent pieces of a heterogeneous agent run that report to the
 * server: ordered batch ingest, the finish receipt, the operation heartbeat
 * and operation-token renewal. Shared by `orvilo hetero exec` and the desktop
 * main process.
 */
export { BatchIngester, type IngestSink } from './BatchIngester';
export { CoalescingBatchIngester } from './CoalescingBatchIngester';
export { createOperationHeartbeat } from './OperationHeartbeat';
export { createOperationTokenRenewal } from './OperationTokenRenewal';
export { type HeteroIngestClient, type IngestAgentType, TrpcIngestSink } from './TrpcIngestSink';
export {
  buildHeteroFinishError,
  consumeTurnEvents,
  deriveTurnOutcome,
  type HeteroFinishError,
  isMissingGrokResumeSession,
  looksLikeNeedsRetryWithoutResume,
  RESUME_RETRY_PATTERNS,
  type TurnEventSummary,
} from './turnOutcome';
