/**
 * Orvilo Skill Server connection status
 */
export enum OrviloSkillStatus {
  /** Connected and ready to use */
  CONNECTED = 'connected',
  /** Connecting */
  CONNECTING = 'connecting',
  /** Connection failed or token expired */
  ERROR = 'error',
  /** Not connected */
  NOT_CONNECTED = 'not_connected',
}

/**
 * Orvilo Skill Tool definition (from Market API)
 */
export interface OrviloSkillTool {
  /** Tool description */
  description?: string;
  /** JSON Schema for tool input */
  inputSchema: {
    additionalProperties?: boolean;
    properties?: Record<string, any>;
    required?: string[];
    type: string;
  };
  /** Tool name */
  name: string;
}

/**
 * Orvilo Skill Provider definition (from Market API)
 */
export interface OrviloSkillProvider {
  /** Provider icon URL */
  icon?: string;
  /** Provider ID (e.g., 'linear', 'github') */
  id: string;
  /** Display name */
  name: string;
  /** Whether token refresh is supported */
  refreshSupported?: boolean;
  /** Provider type */
  type?: 'mcp' | 'rest';
}

/**
 * Orvilo Skill Server instance (user-connected provider)
 */
export interface OrviloSkillServer {
  /** Cache timestamp */
  cachedAt?: number;
  /** Error message */
  errorMessage?: string;
  /** Provider icon URL */
  icon?: string;
  /** Provider ID (e.g., 'linear') */
  identifier: string;
  /** Whether authenticated */
  isConnected: boolean;
  /** Provider display name */
  name: string;
  /** Provider username (e.g., GitHub username) */
  providerUsername?: string;
  /** Authorized scopes */
  scopes?: string[];
  /** Connection status */
  status: OrviloSkillStatus;
  /** Token expiration time */
  tokenExpiresAt?: string;
  /** Tool list (available after connection) */
  tools?: OrviloSkillTool[];
}

/**
 * Parameters for calling Orvilo Skill tool
 */
export interface CallOrviloSkillToolParams {
  /** Tool arguments */
  args?: Record<string, unknown>;
  /** Provider ID (e.g., 'linear') */
  provider: string;
  /** Tool name */
  toolName: string;
  /** Topic ID from message context (not global active state) */
  topicId?: string;
}

/**
 * Result of calling Orvilo Skill tool
 */
export interface CallOrviloSkillToolResult {
  /** Return data */
  data?: any;
  /** Error message */
  error?: string;
  /** Error code */
  errorCode?: string;
  /** Whether successful */
  success: boolean;
}
