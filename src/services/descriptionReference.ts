import type { TaskWorkflowCategory } from '@orvilo/types';

import {
  descriptionReferenceWorkspaceSlug,
  validateDescriptionReference,
} from '@/libs/editor/descriptionReference';

import { pullRequestService } from './pullRequest';
import { taskService } from './task';

export type DescriptionReferenceMetadata =
  | {
      identifier: string;
      kind: 'issue';
      title: string;
      workflowCategory?: TaskWorkflowCategory;
    }
  | { isDraft: boolean; kind: 'pull-request'; state: string | null; title: string };

/** Existing readers own viewer/workspace/OAuth admission; errors remain errors. */
export const resolveDescriptionReference = async (
  value: unknown,
  appOrigin: string,
  workspaceSlug?: string,
): Promise<DescriptionReferenceMetadata> => {
  const reference = validateDescriptionReference(value, appOrigin);
  if (!reference) throw new Error('Invalid reference');
  const targetWorkspace = descriptionReferenceWorkspaceSlug(reference);
  if (targetWorkspace && targetWorkspace !== workspaceSlug)
    throw new Error('Reference not readable in this workspace');

  if (reference.kind === 'pull-request') {
    const response = await pullRequestService.detail(reference.id);
    if (!response) throw new Error('Reference not readable');
    const { data } = response;
    return {
      isDraft: data.isDraft,
      kind: 'pull-request',
      state: data.state,
      title: data.title,
    };
  }

  const { data } = await taskService.find(reference.id);
  return {
    identifier: data.identifier ?? reference.id,
    kind: 'issue',
    title: data.name || data.identifier || reference.id,
    workflowCategory: data.workflowCategory ?? undefined,
  };
};
