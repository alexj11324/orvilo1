import { MARKDOWN_MIME_TYPES } from '@orvilo/const';
import {
  type AuditSafePathsParams,
  type AuditSafePathsResult,
  type DeviceSandboxCapabilityResult,
  type DeviceSandboxInstallResult,
  type EditLocalFileParams,
  type EditLocalFileResult,
  type EnsureSandboxWorkspaceParams,
  type EnsureSandboxWorkspaceResult,
  type GetCommandOutputParams,
  type GetCommandOutputResult,
  type GlobFilesParams,
  type GlobFilesResult,
  type GrepContentParams,
  type GrepContentResult,
  type HashLocalFileParams,
  type KillCommandParams,
  type KillCommandResult,
  type ListLocalFileParams,
  type ListLocalFilesResult,
  type ListProjectSkillsParams,
  type ListProjectSkillsResult,
  type LocalFileItem,
  type LocalFilePreviewUrlParams,
  type LocalMoveFilesResultItem,
  type LocalReadFileParams,
  type LocalReadFileResult,
  type LocalReadFilesParams,
  type LocalSearchFilesParams,
  type MoveLocalFilesParams,
  type OpenLocalFileParams,
  type OpenLocalFolderParams,
  type PrepareSkillDirectoryParams,
  type PrepareSkillDirectoryResult,
  type ProjectFileIndexParams,
  type ProjectFileIndexResult,
  type ProjectFileSearchParams,
  type ProjectFileSearchResult,
  type RenameLocalFileParams,
  type ResolveSkillResourcePathParams,
  type ResolveSkillResourcePathResult,
  type RunCommandParams,
  type RunCommandResult,
  type ShowSaveDialogParams,
  type ShowSaveDialogResult,
  type WriteLocalFileParams,
} from '@orvilo/electron-client-ipc';

import { requireProvenLocalDeviceId } from '@/services/localExecutionIdentity';
import { ensureElectronIpc } from '@/utils/electron/ipc';

const TEXT_PREVIEW_MIME_TYPES = new Set([
  'application/graphql',
  'application/javascript',
  'application/json',
  'application/markdown',
  'application/toml',
  'application/xml',
  'application/yaml',
  ...MARKDOWN_MIME_TYPES,
]);

export interface BinaryLocalFilePreview {
  contentType: string;
  type: 'binary' | 'pdf' | 'video';
}

/**
 * Binary document (pdf / office) small enough to preview in-app. Oversized
 * documents stay on the content-less `binary` / `pdf` variants.
 */
export interface DocumentLocalFilePreview {
  blob: Blob;
  contentType: string;
  type: 'document';
}

export interface ImageLocalFilePreview {
  blob: Blob;
  contentType: string;
  type: 'image';
}

export interface TextLocalFilePreview {
  content: string;
  contentType: string;
  resourceBaseUrl?: string;
  type: 'text';
}

export type LocalFilePreview =
  BinaryLocalFilePreview | DocumentLocalFilePreview | ImageLocalFilePreview | TextLocalFilePreview;

/** Binary documents the in-app portal can preview (or offer to download). */
const DOCUMENT_PREVIEW_MIME_TYPES = new Set([
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Mirrors the device-RPC document cap (`MAX_DOCUMENT_PREVIEW_BYTES` in the
 * desktop / device-control serializers) so the same file previews — or falls
 * back — identically on every transport.
 */
const MAX_DOCUMENT_PREVIEW_BYTES = 20 * 1024 * 1024;

const normalizeContentType = (contentType: string | null): string =>
  contentType?.split(';')[0].trim().toLowerCase() ?? '';

const isTextPreviewMimeType = (mimeType: string): boolean =>
  mimeType.startsWith('text/') || TEXT_PREVIEW_MIME_TYPES.has(mimeType);

const fetchLocalFilePreview = async (
  url: string,
  accept?: LocalFilePreviewUrlParams['accept'],
  resourceScope?: LocalFilePreviewUrlParams['resourceScope'],
): Promise<LocalFilePreview> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load local file: ${response.status}`);
  }

  const contentType = normalizeContentType(response.headers.get('content-type'));

  if (contentType.startsWith('image/')) {
    return { blob: await response.blob(), contentType, type: 'image' };
  }

  if (accept === 'image') {
    throw new Error('Unsupported local file preview type');
  }

  if (isTextPreviewMimeType(contentType)) {
    return {
      content: await response.text(),
      contentType,
      resourceBaseUrl: resourceScope === 'workspace' ? new URL('.', url).toString() : undefined,
      type: 'text',
    };
  }

  if (DOCUMENT_PREVIEW_MIME_TYPES.has(contentType)) {
    // Gate on the size headers first so an oversized document is never
    // materialized in renderer memory just to be discarded. The desktop
    // protocol short-circuits oversized documents with an empty body and the
    // real size in `X-Preview-Content-Size`; Content-Length covers hosts that
    // still serve the body. Fall back to the blob-size check otherwise.
    const contentLength = Number(
      response.headers.get('x-preview-content-size') ?? response.headers.get('content-length'),
    );
    const oversizedByHeader =
      Number.isFinite(contentLength) &&
      contentLength > 0 &&
      contentLength > MAX_DOCUMENT_PREVIEW_BYTES;

    if (!oversizedByHeader) {
      const blob = await response.blob();
      if (blob.size <= MAX_DOCUMENT_PREVIEW_BYTES) {
        return { blob, contentType, type: 'document' };
      }
    }
  }

  if (contentType === 'application/pdf') {
    return { contentType, type: 'pdf' };
  }

  if (contentType.startsWith('video/')) {
    return { contentType, type: 'video' };
  }

  return { contentType, type: 'binary' };
};

const fetchLocalFileBytes = async (
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | undefined> => {
  const response = await fetch(url);
  if (!response.ok) return;

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType:
      normalizeContentType(response.headers.get('content-type')) || 'application/octet-stream',
  };
};

class LocalFileService {
  // File Operations
  async listLocalFiles(params: ListLocalFileParams): Promise<ListLocalFilesResult> {
    await requireProvenLocalDeviceId('listLocalFiles');
    return ensureElectronIpc().localSystem.listLocalFiles(params);
  }

  async readLocalFile(params: LocalReadFileParams): Promise<LocalReadFileResult> {
    await requireProvenLocalDeviceId('readLocalFile');
    return ensureElectronIpc().localSystem.readFile(params);
  }

  async hashLocalFile(params: HashLocalFileParams): Promise<string> {
    await requireProvenLocalDeviceId('hashLocalFile');
    return ensureElectronIpc().localSystem.hashLocalFile(params);
  }

  async readLocalFiles(params: LocalReadFilesParams): Promise<LocalReadFileResult[]> {
    await requireProvenLocalDeviceId('readLocalFiles');
    return ensureElectronIpc().localSystem.readFiles(params);
  }

  async searchLocalFiles(params: LocalSearchFilesParams): Promise<LocalFileItem[]> {
    await requireProvenLocalDeviceId('searchLocalFiles');
    return ensureElectronIpc().localSystem.handleLocalFilesSearch(params);
  }

  async getProjectFileIndex(params: ProjectFileIndexParams): Promise<ProjectFileIndexResult> {
    await requireProvenLocalDeviceId('getProjectFileIndex');
    return ensureElectronIpc().localSystem.getProjectFileIndex(params);
  }

  async searchProjectFiles(params: ProjectFileSearchParams): Promise<ProjectFileSearchResult> {
    await requireProvenLocalDeviceId('searchProjectFiles');
    return ensureElectronIpc().localSystem.searchProjectFiles(params);
  }

  async listProjectSkills(params: ListProjectSkillsParams): Promise<ListProjectSkillsResult> {
    await requireProvenLocalDeviceId('listProjectSkills');
    // Project-skill scanning lives in the main-process WorkspaceCtr ('workspace'
    // group), split out of LocalFileCtr — hence the namespace differs from the
    // other local-file ops here.
    return ensureElectronIpc().workspace.listProjectSkills(params);
  }

  async openLocalFile(params: OpenLocalFileParams) {
    await requireProvenLocalDeviceId('openLocalFile');
    return ensureElectronIpc().localSystem.handleOpenLocalFile(params);
  }

  async openLocalFolder(params: OpenLocalFolderParams) {
    await requireProvenLocalDeviceId('openLocalFolder');
    return ensureElectronIpc().localSystem.handleOpenLocalFolder(params);
  }

  async moveLocalFiles(params: MoveLocalFilesParams): Promise<LocalMoveFilesResultItem[]> {
    await requireProvenLocalDeviceId('moveLocalFiles');
    return ensureElectronIpc().localSystem.handleMoveFiles(params);
  }

  async renameLocalFile(params: RenameLocalFileParams) {
    await requireProvenLocalDeviceId('renameLocalFile');
    return ensureElectronIpc().localSystem.handleRenameFile(params);
  }

  async writeFile(params: WriteLocalFileParams) {
    await requireProvenLocalDeviceId('writeFile');
    return ensureElectronIpc().localSystem.handleWriteFile(params);
  }

  async auditSafePaths(params: AuditSafePathsParams): Promise<AuditSafePathsResult> {
    await requireProvenLocalDeviceId('auditSafePaths');
    return ensureElectronIpc().localSystem.auditSafePaths(params);
  }

  async getLocalFilePreview(params: LocalFilePreviewUrlParams): Promise<LocalFilePreview> {
    await requireProvenLocalDeviceId('getLocalFilePreview');
    const result = await ensureElectronIpc().localSystem.getLocalFilePreviewUrl(params);

    if (!result.success || !result.url) {
      throw new Error(result.error || 'Missing local file preview URL');
    }

    return fetchLocalFilePreview(result.url, params.accept, params.resourceScope);
  }

  async readLocalFileBytes(
    params: LocalFilePreviewUrlParams,
  ): Promise<{ bytes: Uint8Array; contentType: string } | undefined> {
    await requireProvenLocalDeviceId('readLocalFileBytes');
    const result = await ensureElectronIpc().localSystem.getLocalFilePreviewUrl(params);

    if (!result.success || !result.url) return;

    return fetchLocalFileBytes(result.url);
  }

  async readExternalAssetForPublish(params: {
    path: string;
    workingDirectory: string;
  }): Promise<{ bytes: Uint8Array; contentType: string } | undefined> {
    await requireProvenLocalDeviceId('readExternalAssetForPublish');
    const result = await ensureElectronIpc().localSystem.getExternalAssetForPublishUrl(params);
    if (!result.success || !result.url) return;

    return fetchLocalFileBytes(result.url);
  }

  async copyAssetForPublish(params: {
    from: string;
    to: string;
    workingDirectory: string;
  }): Promise<{ error?: string; success: boolean }> {
    await requireProvenLocalDeviceId('copyAssetForPublish');
    return ensureElectronIpc().localSystem.copyAssetForPublish(params);
  }

  async prepareSkillDirectory(
    params: PrepareSkillDirectoryParams,
  ): Promise<PrepareSkillDirectoryResult> {
    await requireProvenLocalDeviceId('prepareSkillDirectory');
    return ensureElectronIpc().localSystem.handlePrepareSkillDirectory(params);
  }

  async resolveSkillResourcePath(
    params: ResolveSkillResourcePathParams,
  ): Promise<ResolveSkillResourcePathResult> {
    await requireProvenLocalDeviceId('resolveSkillResourcePath');
    return ensureElectronIpc().localSystem.handleResolveSkillResourcePath(params);
  }

  async editLocalFile(params: EditLocalFileParams): Promise<EditLocalFileResult> {
    await requireProvenLocalDeviceId('editLocalFile');
    return ensureElectronIpc().localSystem.handleEditFile(params);
  }

  // Shell Commands
  async runCommand(params: RunCommandParams): Promise<RunCommandResult> {
    await requireProvenLocalDeviceId('runCommand');
    return ensureElectronIpc().shellCommand.handleRunCommand(params);
  }

  /**
   * Whether this machine can run sandboxed commands. Asked before offering the
   * "Local Sandbox" execution environment — the host, not the platform string,
   * is the authority (Linux support depends on binaries that may be absent).
   */
  async getSandboxCapability(): Promise<DeviceSandboxCapabilityResult> {
    await requireProvenLocalDeviceId('getSandboxCapability');
    return ensureElectronIpc().shellCommand.getSandboxCapability();
  }

  /**
   * Provision the sandbox backend on this machine (one elevation prompt on
   * Windows) and report the capability afterwards. User-initiated only.
   */
  async installSandbox(): Promise<DeviceSandboxInstallResult> {
    await requireProvenLocalDeviceId('installSandbox');
    return ensureElectronIpc().shellCommand.installSandbox();
  }

  /**
   * Create (and return) the default directory a sandboxed agent should work in.
   * The caller persists it as the agent's working directory, so the default is
   * visible and changeable rather than hidden.
   */
  async ensureSandboxWorkspace(
    params: EnsureSandboxWorkspaceParams,
  ): Promise<EnsureSandboxWorkspaceResult> {
    await requireProvenLocalDeviceId('ensureSandboxWorkspace');
    return ensureElectronIpc().shellCommand.ensureSandboxWorkspace(params);
  }

  async getCommandOutput(params: GetCommandOutputParams): Promise<GetCommandOutputResult> {
    await requireProvenLocalDeviceId('getCommandOutput');
    return ensureElectronIpc().shellCommand.handleGetCommandOutput(params);
  }

  async killCommand(params: KillCommandParams): Promise<KillCommandResult> {
    await requireProvenLocalDeviceId('killCommand');
    return ensureElectronIpc().shellCommand.handleKillCommand(params);
  }

  // Search & Find
  async grepContent(params: GrepContentParams): Promise<GrepContentResult> {
    await requireProvenLocalDeviceId('grepContent');
    return ensureElectronIpc().localSystem.handleGrepContent(params);
  }

  async globFiles(params: GlobFilesParams): Promise<GlobFilesResult> {
    await requireProvenLocalDeviceId('globFiles');
    return ensureElectronIpc().localSystem.handleGlobFiles(params);
  }

  // Dialog
  async showSaveDialog(params: ShowSaveDialogParams): Promise<ShowSaveDialogResult> {
    await requireProvenLocalDeviceId('showSaveDialog');
    return ensureElectronIpc().localSystem.handleShowSaveDialog(params);
  }

  // Helper methods
  async openLocalFileOrFolder(path: string, isDirectory: boolean) {
    await requireProvenLocalDeviceId('openLocalFileOrFolder');
    if (isDirectory) {
      return this.openLocalFolder({ isDirectory, path });
    } else {
      return this.openLocalFile({ path });
    }
  }

  async openFileFolder(path: string) {
    await requireProvenLocalDeviceId('openFileFolder');
    return this.openLocalFolder({ isDirectory: false, path });
  }
}

export const localFileService = new LocalFileService();
