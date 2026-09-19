import { useWorkspaceCapabilities } from './useWorkspaceCapabilities';

/**
 * Whether the caller's role on the active workspace is `viewer` (read-only).
 * Personal mode is not a viewer scope — returns `false` there.
 */
export const useIsWorkspaceViewer = (): boolean => useWorkspaceCapabilities().role === 'viewer';
