import { afterEach, describe, expect, it, vi } from 'vitest';

const mockDeviceClient = vi.hoisted(() => ({
  getProjectFileIndex: { query: vi.fn() },
  listGitBranches: { query: vi.fn() },
  listProjectSkills: { query: vi.fn() },
}));

const mockLocalFileService = vi.hoisted(() => ({
  getProjectFileIndex: vi.fn(),
  listProjectSkills: vi.fn(),
}));

const mockElectronGitService = vi.hoisted(() => ({
  listGitBranches: vi.fn(),
}));

const mockHeterogeneousAgentService = vi.hoisted(() => ({
  getClaudeCodeQuota: vi.fn(),
  listModels: vi.fn(),
}));

// The web surface: no Electron bridge exists, so an unbound service call must
// fail with TargetRequiredError instead of dying inside `ensureElectronIpc`.
vi.mock('@orvilo/const', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  isDesktop: false,
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    device: mockDeviceClient,
  },
}));

vi.mock('@/services/electron/localFileService', () => ({
  localFileService: mockLocalFileService,
}));

vi.mock('@/services/electron/git', () => ({
  electronGitService: mockElectronGitService,
}));

vi.mock('@/services/electron/heterogeneousAgent', () => ({
  heterogeneousAgentService: mockHeterogeneousAgentService,
}));

// Guards throw synchronously in non-async methods and reject in async ones —
// capture both shapes so each chokepoint is asserted on the error, not the
// delivery mechanism.
const captureError = async (call: () => unknown): Promise<unknown> => {
  try {
    return await (call() as Promise<unknown>);
  } catch (error) {
    return error;
  }
};

describe('TargetRequiredError service boundary (web, no bound device)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a stable TARGET_REQUIRED discriminator', async () => {
    const { isTargetRequiredError, TargetRequiredError } = await import('./targetRequiredError');
    const error = new TargetRequiredError('probe');

    expect(error.code).toBe('TARGET_REQUIRED');
    expect(error.operation).toBe('probe');
    expect(isTargetRequiredError(error)).toBe(true);
    expect(isTargetRequiredError({ code: 'TARGET_REQUIRED' })).toBe(true);
    expect(isTargetRequiredError(new Error('other'))).toBe(false);
    expect(isTargetRequiredError(undefined)).toBe(false);
  });

  it('rejects git calls without a device instead of reaching Electron IPC', async () => {
    const { gitService } = await import('./git');
    const { isTargetRequiredError } = await import('./targetRequiredError');

    const failure = await captureError(() => gitService.listGitBranches({ path: '/repo' }));

    expect(isTargetRequiredError(failure)).toBe(true);
    expect((failure as { operation?: string }).operation).toBe('listGitBranches');
    expect(mockElectronGitService.listGitBranches).not.toHaveBeenCalled();
    expect(mockDeviceClient.listGitBranches.query).not.toHaveBeenCalled();
  });

  it('rejects project file index calls without a device', async () => {
    const { projectFileService } = await import('./projectFile');
    const { isTargetRequiredError } = await import('./targetRequiredError');

    const failure = await captureError(() =>
      projectFileService.getProjectFileIndex({ scope: '/repo' }),
    );

    expect(isTargetRequiredError(failure)).toBe(true);
    expect(mockLocalFileService.getProjectFileIndex).not.toHaveBeenCalled();
    expect(mockDeviceClient.getProjectFileIndex.query).not.toHaveBeenCalled();
  });

  it('rejects project skill listing without a device', async () => {
    const { projectSkillService } = await import('./projectSkill');
    const { isTargetRequiredError } = await import('./targetRequiredError');

    const failure = await captureError(() =>
      projectSkillService.listProjectSkills({ scope: '/repo' }),
    );

    expect(isTargetRequiredError(failure)).toBe(true);
    expect(mockLocalFileService.listProjectSkills).not.toHaveBeenCalled();
    expect(mockDeviceClient.listProjectSkills.query).not.toHaveBeenCalled();
  });

  it('rejects the heterogeneous model catalog without a device', async () => {
    const { heterogeneousAgentCatalogService } = await import('./heterogeneousAgent');
    const { isTargetRequiredError } = await import('./targetRequiredError');

    const failure = await captureError(() =>
      heterogeneousAgentCatalogService.listModels({ type: 'claude-code' }),
    );

    expect(isTargetRequiredError(failure)).toBe(true);
    expect(mockHeterogeneousAgentService.listModels).not.toHaveBeenCalled();
  });

  it('rejects the Claude quota snapshot without a device', async () => {
    const { fetchClaudeCodeQuotaSnapshot } = await import('./heteroAgentQuota');
    const { isTargetRequiredError } = await import('./targetRequiredError');

    const failure = await captureError(() => fetchClaudeCodeQuotaSnapshot({}));

    expect(isTargetRequiredError(failure)).toBe(true);
    expect(mockHeterogeneousAgentService.getClaudeCodeQuota).not.toHaveBeenCalled();
  });

  it('still routes bound-device calls through the device RPCs', async () => {
    const { gitService } = await import('./git');
    const { projectFileService } = await import('./projectFile');

    mockDeviceClient.listGitBranches.query.mockResolvedValue([]);
    mockDeviceClient.getProjectFileIndex.query.mockResolvedValue(undefined);

    await gitService.listGitBranches({ deviceId: 'device-1', path: '/repo' });
    await projectFileService.getProjectFileIndex({ deviceId: 'device-1', scope: '/repo' });

    expect(mockDeviceClient.listGitBranches.query).toHaveBeenCalledWith({
      deviceId: 'device-1',
      path: '/repo',
    });
    expect(mockDeviceClient.getProjectFileIndex.query).toHaveBeenCalledWith({
      deviceId: 'device-1',
      scope: '/repo',
    });
    expect(mockElectronGitService.listGitBranches).not.toHaveBeenCalled();
    expect(mockLocalFileService.getProjectFileIndex).not.toHaveBeenCalled();
  });
});
