'use client';

import { useSyncExternalStore } from 'react';

import { getActiveWorkspaceSlug, subscribeActiveWorkspace } from './useActiveWorkspaceId';

export { getActiveWorkspaceSlug } from './useActiveWorkspaceId';

export const useActiveWorkspaceSlug = (): string | null =>
  useSyncExternalStore(subscribeActiveWorkspace, getActiveWorkspaceSlug, getActiveWorkspaceSlug);
