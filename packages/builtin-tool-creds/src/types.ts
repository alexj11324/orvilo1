import type { CredType } from '@orvilo/types';

export const CredsApiName = {
  /**
   * Inject credentials to sandbox environment
   * Only available when sandbox mode is enabled
   */
  injectCredsToSandbox: 'injectCredsToSandbox',

  /**
   * Save a new credential
   * Use when user wants to store sensitive info securely
   */
  saveCreds: 'saveCreds',
} as const;

export type CredsApiNameType = (typeof CredsApiName)[keyof typeof CredsApiName];

// ==================== Tool Parameter Types ====================

export interface InjectCredsToSandboxParams {
  /**
   * The credential keys to inject
   */
  keys: string[];
}

export interface InjectCredsToSandboxState {
  /**
   * Injected credential keys
   */
  injected: string[];
  /**
   * Keys that failed to inject (not found or not available)
   */
  missing: string[];
  /**
   * Whether injection was successful
   */
  success: boolean;
}

export interface SaveCredsParams {
  /**
   * Optional description for the credential
   */
  description?: string;
  /**
   * Unique key for the credential (used for reference)
   */
  key: string;
  /**
   * Display name for the credential
   */
  name: string;
  /**
   * The type of credential
   */
  type: CredType;
  /**
   * Key-value pairs of the credential (for kv-env and kv-header types)
   */
  values: Record<string, string>;
}

export interface SaveCredsState {
  /**
   * The created credential key
   */
  key?: string;
  /**
   * Error message if save failed
   */
  message?: string;
  /**
   * Whether save was successful
   */
  success: boolean;
}

// ==================== Context Types ====================

export interface CredSummaryForContext {
  description?: string;
  key: string;
  name: string;
  type: CredType;
}
