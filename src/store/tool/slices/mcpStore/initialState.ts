import { type MCPInstallProgressMap } from '@/types/plugins';

export interface MCPStoreState {
  mcpInstallAbortControllers: Record<string, AbortController>;
  mcpInstallProgress: MCPInstallProgressMap;
  // Test connection related state
  mcpTestAbortControllers: Record<string, AbortController>;
  mcpTestErrors: Record<string, string>;
  mcpTestLoading: Record<string, boolean>;
}

export const initialMCPStoreState: MCPStoreState = {
  mcpInstallAbortControllers: {},
  mcpInstallProgress: {},
  // Test connection related state initialization
  mcpTestAbortControllers: {},
  mcpTestErrors: {},
  mcpTestLoading: {},
};
