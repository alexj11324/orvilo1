'use client';

import { type FC } from 'react';
import { Navigate, useParams } from 'react-router';

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
 * Electron keeps its own `createHomeElement`, so this never runs there.
 */
const WebHomeRedirect: FC = () => {
  const { workspaceSlug } = useParams();

  return <Navigate replace to={buildWorkspaceAwarePath('/tasks', workspaceSlug)} />;
};

export default WebHomeRedirect;
