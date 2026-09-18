'use client';

import { type FC } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';

import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';

/**
 * What the root index means on Web now that the chat inbox is retired: the app
 * opens on the task list.
 *
 * The slug is read from the route rather than from the active-workspace store.
 * This element is the first thing a cold load renders, before the workspace
 * context has settled, so a store-derived slug would resolve to `undefined` and
 * send a workspace URL to the personal `/tasks`.
 *
 * The query is carried across. Root-path links arrive with parameters attached —
 * `?onboarding=task` is how the post-onboarding entry asks for the board, and an
 * auth callback or invitation can sanitize down to `/` — and dropping them here
 * would let the landing redirect silently steal a deep link.
 *
 * Electron uses the same element for its `createHomeElement`: each tab owns a
 * memory router, so the index slot of a fresh `/` (or `/:workspaceSlug`) tab
 * redirects inside that tab to the same `/tasks` board Web lands on. Explicit
 * tab urls never touch this slot, so a deep link or a restored tab keeps its
 * own target.
 */
const WebHomeRedirect: FC = () => {
  const { workspaceSlug } = useParams();
  const { search } = useLocation();

  return (
    <Navigate replace to={{ pathname: buildWorkspaceAwarePath('/tasks', workspaceSlug), search }} />
  );
};

export default WebHomeRedirect;
