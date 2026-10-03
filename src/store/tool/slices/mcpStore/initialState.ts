import { type MCPInstallProgressMap } from '@/types/plugins';

export interface MCPStoreState {
  mcpInstallAbortControllers: Record<string, AbortController>;
  mcpInstallProgress: MCPInstallProgressMap;
  /**
   * Identifier -> the scope-complete operation key that currently owns the
   * install/test state rows. Operation-state maps are keyed by the composite
   * operation key (principal + workspace + device scope + connection + config
   * fingerprint); this index lets identifier-based selectors resolve the
   * active operation without knowing the scope it ran under.
   */
  mcpOperationKeyByIdentifier: Record<string, string>;
  // Test connection related state
  mcpTestAbortControllers: Record<string, AbortController>;
  mcpTestErrors: Record<string, string>;
  mcpTestLoading: Record<string, boolean>;
}

export const initialMCPStoreState: MCPStoreState = {
  mcpInstallAbortControllers: {},
  mcpInstallProgress: {},
  mcpOperationKeyByIdentifier: {},
  // Test connection related state initialization
  mcpTestAbortControllers: {},
  mcpTestErrors: {},
  mcpTestLoading: {},
};
