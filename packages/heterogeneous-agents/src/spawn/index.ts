/**
 * Producer-side helpers for converting external agent CLI output into the
 * unified `AgentStreamEvent` wire shape. Imported by:
 *   - Electron main (`HeterogeneousAgentCtr`) — desktop CC / Codex flow
 *   - The future `lh hetero exec` CLI — sandbox + terminal flow ()
 *
 * Consumers (renderer executor, server `heteroIngest` handler) never need to
 * touch adapters — every event reaching them is already an `AgentStreamEvent`.
 *
 * `AgentStreamEvent` itself is re-exported here so producer-side callers
 * (desktop main, CLI sandbox) only depend on this package, not on
 * `@orvilo/agent-gateway-client` (which is a browser-side WebSocket client
 * that producers have no business pulling in).
 */
export { buildCodexAppServerArgs } from '../codex';
export type { UsageData } from '../types';
export {
  ACP_PROTOCOL_VERSION,
  AcpAgentSession,
  type AcpAgentSessionConfig,
  type AcpAgentSessionOptions,
  type AcpPermissionOption,
  parseAcpPermissionOptions,
  selectAcpPermissionOption,
} from './acpAgentSession';
export {
  type AcpRpcErrorData,
  type AcpRpcMessage,
  AcpRpcResponseError,
  AcpServerRequestError,
  AcpStdioClient,
  type AcpStdioClientOptions,
} from './acpStdioClient';
export {
  AgentStreamPipeline,
  type AgentStreamPipelineOptions,
  type UploadHeterogeneousImage,
} from './agentStreamPipeline';
export {
  classifyHeteroProcessFailure,
  type ClassifyHeteroProcessFailureParams,
  HETERO_WORKING_DIRECTORY_NOT_FOUND,
  isHeteroStatusGuideErrorData,
} from './classifyProcessFailure';
export { type CliSpawnPlan, resolveCliSpawnPlan } from './cliSpawn';
export { CodexFileChangeTracker } from './codexFileChangeTracker';
export {
  type CodexInitialModelResolution,
  type CodexInitialModelSource,
  type CodexSessionModelInfo,
  getCodexHome,
  parseCodexModelFromArgs,
  parseCodexProfileFromArgs,
  readCodexSessionModel,
  resolveCodexInitialModel,
} from './codexModel';
export {
  buildCursorAcpArgs,
  buildCursorAcpPrompt,
  CursorAcpSession,
  type CursorAcpSessionOptions,
  type CursorAcpTextPromptBlock,
  isCursorAcpSessionNotFoundError,
  normalizeCursorQuestion,
} from './cursorAcpSession';
export {
  buildDevinAcpArgs,
  buildDevinAcpPrompt,
  type DevinAcpImagePromptBlock,
  type DevinAcpPromptBlock,
  DevinAcpSession,
  type DevinAcpSessionOptions,
  type DevinAcpTextPromptBlock,
  isDevinAcpSessionNotFoundError,
} from './devinAcpSession';
export {
  buildDroidAcpArgs,
  buildDroidAcpPrompt,
  type DroidAcpImagePromptBlock,
  type DroidAcpModelCatalog,
  type DroidAcpPromptBlock,
  DroidAcpSession,
  type DroidAcpSessionOptions,
  type DroidAcpTextPromptBlock,
  isDroidAcpSessionNotFoundError,
  listDroidAcpModels,
  type ListDroidAcpModelsOptions,
  parseDroidAcpModelCatalog,
} from './droidAcpSession';
export {
  createFileStoreImageUploader,
  type FileStoreCreateFileInput,
  type FileStorePort,
} from './fileStoreImageUploader';
export {
  buildGrokAcpArgs,
  buildGrokAcpPrompt,
  type GrokAcpContentBlock,
  GrokAcpSession,
  type GrokAcpSessionOptions,
} from './grokAcpSession';
export {
  type AgentContentBlock,
  type AgentImageBlock,
  type AgentImageSource,
  type AgentPromptInput,
  type AgentTextBlock,
  type BuildAgentInputOptions,
  buildHeteroExecStdinPayload,
  type HeteroExecImageRef,
  materializeImageToPath,
  type NormalizedImage,
  normalizeImage,
  type NormalizeImageOptions,
} from './input';
export { JsonlStreamProcessor } from './jsonlProcessor';
export type {
  HeterogeneousAgentRuntimeState,
  HeterogeneousAgentRuntimeStatus,
  HeterogeneousAgentRuntimeTask,
} from './runtimeStatus';
// NOTE: `resolveCliCommand` is intentionally NOT re-exported here. It runs
// `promisify(execFile)` at module load, which throws under a partial
// `node:child_process` mock — and this barrel is widely imported (e.g. for
// `resolveCliSpawnPlan`), so pulling it in would break unrelated suites at
// import time. Import it from the dedicated `@orvilo/heterogeneous-agents/
// resolveCliCommand` subpath instead.
export {
  ACP_AGENT_RUNTIMES,
  ACP_RUNTIME_AGENT_TYPES,
  type AcpAgentRuntimeSpec,
  type AcpBridgeRunnerTarget,
  type AcpBridgeSpec,
  buildAcpBridgeNotFoundError,
  detectAcpBridgeCommand,
  detectAcpBridgeRunner,
  getAcpAgentRuntime,
  isAcpBridgeAgent,
} from './acpRuntime';
export {
  ensureClaudeCodeResumeTranscript,
  type EnsureResumeTranscriptReason,
  type EnsureResumeTranscriptResult,
  resolveClaudeCodeTranscriptPath,
} from './ensureResumeTranscript';
export {
  spawnAgent,
  type SpawnAgentHandle,
  type SpawnAgentOptions,
  spawnTraeAcpAgent,
} from './spawnAgent';
export {
  type AcpSpawnTarget,
  buildStandardAcpArgs,
  createStandardAcpSession,
  extractStandardAcpSelectors,
  listStandardAcpModels,
  type ListStandardAcpModelsOptions,
  resolveAcpSpawnTarget,
  type StandardAcpSelectors,
} from './standardAcpAgents';
export {
  buildStandardAcpPrompt,
  isStandardAcpSessionNotFoundError,
  type StandardAcpConfigOption,
  type StandardAcpImagePromptBlock,
  type StandardAcpPromptBlock,
  StandardAcpSession,
  type StandardAcpSessionConfig,
  type StandardAcpSessionOptions,
  type StandardAcpTextPromptBlock,
} from './standardAcpSession';
export { toStreamEvent } from './streamEvent';
export {
  buildTraeAcpArgs,
  buildTraeAcpPrompt,
  type TraeAcpImagePromptBlock,
  type TraeAcpPromptBlock,
  TraeAcpSession,
  type TraeAcpSessionOptions,
  type TraeAcpTextPromptBlock,
} from './traeAcpSession';
export type { AgentStreamEvent, AgentStreamEventType } from '@orvilo/agent-gateway-client';
