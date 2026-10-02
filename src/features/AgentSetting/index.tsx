export { default as AgentCategory } from './AgentCategory';
export { default as AgentSettings } from './AgentSettings';
/**
 * The whole per-agent settings body (header + tabs + `AgentSettings`) bound to
 * `useAgentStore.activeAgentId` — used by the profile settings modal and the
 * Settings → Agents page; callers own the agent-id scoping.
 */
export { AgentSettingsProvider } from './AgentSettingsProvider';
export { default as AgentSettingsContent } from './Content';
export type { AgentSettingsInstance } from './hooks/useAgentSettings';
export type { SettingsModalLayoutProps, SettingsModalTabItem } from './SettingsModalLayout';
export { default as SettingsModalLayout } from './SettingsModalLayout';
