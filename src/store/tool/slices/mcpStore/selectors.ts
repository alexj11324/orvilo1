import { type ToolStoreState } from '../../initialState';

const isPluginInstallLoading = (id: string) => (s: ToolStoreState) => s.pluginInstallLoading[id];

// Operation-state rows are keyed by the scope-complete operation key; the
// identifier index resolves the active operation for UI surfaces that only
// know the plugin identifier. A bare-identifier fallback keeps legacy
// writes readable.
const getOperationKey = (id: string) => (s: ToolStoreState) =>
  s.mcpOperationKeyByIdentifier[id] ?? id;

const getMCPInstallProgress = (id: string) => (s: ToolStoreState) =>
  s.mcpInstallProgress[getOperationKey(id)(s)];

const isMCPInstalling = (id: string) => (s: ToolStoreState) =>
  !!s.mcpInstallProgress[getOperationKey(id)(s)];

const getMCPPluginRequiringConfig = (id: string) => (s: ToolStoreState) =>
  s.mcpInstallProgress[getOperationKey(id)(s)]?.configSchema;

const isMCPPluginRequiringConfig = (id: string) => (s: ToolStoreState) =>
  !!s.mcpInstallProgress[getOperationKey(id)(s)]?.configSchema;

// Check if plugin is installing (has install progress and not in config stage)
const isMCPInstallInProgress = (id: string) => (s: ToolStoreState) => {
  const progress = s.mcpInstallProgress[getOperationKey(id)(s)];

  return !!progress && !progress.needsConfig && progress.step !== 'Error';
};

// Test connection related selectors
const isMCPConnectionTesting = (id: string) => (s: ToolStoreState) =>
  s.mcpTestLoading[getOperationKey(id)(s)] || false;

const getMCPConnectionTestError = (id: string) => (s: ToolStoreState) =>
  s.mcpTestErrors[getOperationKey(id)(s)];

const getMCPConnectionTestState = (id: string) => (s: ToolStoreState) => ({
  error: s.mcpTestErrors[getOperationKey(id)(s)],
  loading: s.mcpTestLoading[getOperationKey(id)(s)] || false,
});

export const mcpStoreSelectors = {
  getMCPConnectionTestError,
  getMCPConnectionTestState,
  getMCPInstallProgress,
  getMCPPluginRequiringConfig,
  isMCPConnectionTesting,
  isMCPInstallInProgress,
  isMCPInstalling,
  isMCPPluginRequiringConfig,
  isPluginInstallLoading,
};
