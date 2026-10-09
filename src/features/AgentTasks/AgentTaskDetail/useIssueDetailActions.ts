import { FilePlusIcon, GitPullRequestIcon, LinkIcon } from 'lucide-react';
import { useCallback } from 'react';

import { usePermission } from '@/hooks/usePermission';
import { mutate } from '@/libs/swr';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { openTaskIssueResourceModal } from './createTaskIssueResourceModal';
import { resolveIssueDetailCapabilities } from './issueDetailCapabilities';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

/** Attachable resource kinds, in menu order. Shared by the header menu and the body. */
export const ISSUE_RESOURCE_KINDS = [
  ['link', LinkIcon],
  ['pull_request', GitPullRequestIcon],
  ['document', FilePlusIcon],
] as const;

export type IssueResourceKind = (typeof ISSUE_RESOURCE_KINDS)[number][0];

/** What the viewer can do on this issue's body; see `resolveIssueDetailCapabilities`. */
export const useIssueDetailCapabilities = () => {
  const { allowed, reason } = usePermission('create_content');
  const task = useTaskDetailSelector(taskDetailSelectors.taskDetail);

  return resolveIssueDetailCapabilities({
    allowed,
    hasDomainRevision: !!task?.domainRevision,
    hasTaskId: !!task?.id,
    reason,
  });
};

/**
 * What the viewer can do on this issue's body, and the one way to attach a
 * resource from it. The picker modal owns the mutation; this only opens it and
 * refreshes what the body shows afterwards.
 */
export const useIssueDetailActions = () => {
  const capabilities = useIssueDetailCapabilities();
  const taskId = useTaskDetailTaskId();
  const taskUuid = useTaskDetailSelector(taskDetailSelectors.taskDetail)?.id;
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);

  const addResource = useCallback(
    (kind: IssueResourceKind) => {
      if (!capabilities.canAddResource || !taskUuid) return;
      openTaskIssueResourceModal({
        kind,
        onChanged: async () => {
          await Promise.all([
            taskId ? refreshTaskDetail(taskId) : undefined,
            mutate(['issue-resources', taskUuid]),
          ]);
        },
        taskId: taskUuid,
      });
    },
    [capabilities.canAddResource, refreshTaskDetail, taskId, taskUuid],
  );

  return { addResource, capabilities };
};
