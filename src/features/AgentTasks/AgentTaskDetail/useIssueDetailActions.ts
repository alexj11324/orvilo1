import { t } from 'i18next';
import { FilePlusIcon, GitPullRequestIcon, LinkIcon } from 'lucide-react';
import { useCallback } from 'react';

import { usePermission } from '@/hooks/usePermission';
import { mutate } from '@/libs/swr';
import { isTaskDetailKey } from '@/libs/swr/keys';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { openTaskIssueResourceModal } from './createTaskIssueResourceModal';
import { resolveIssueDetailCapabilities } from './issueDetailCapabilities';
import { issueResourceRef } from './issueResourceRef';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { openTaskIssueRelationModal } from './TaskIssueRelationModal';

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
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const resourceRef = issueResourceRef(detail);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const refreshTaskList = useTaskStore((s) => s.refreshTaskList);
  const detailId = detail?.id;
  const detailIdentifier = detail?.identifier;
  const domainRevision = detail?.domainRevision;
  // The picker addresses the Issue by database id, so it waits for the detail.
  const canAddExistingSubIssues = capabilities.canAddSubIssue && !!detailId && !!domainRevision;

  /** Pick existing Issues and put them under this one in a single write. */
  const addExistingSubIssues = useCallback(() => {
    if (!canAddExistingSubIssues) return;
    openTaskIssueRelationModal({
      expectedDomainRevision: domainRevision!,
      identifier: detailIdentifier,
      kind: 'parentOf',
      onChanged: async () => {
        // A picked Issue may have been moved out of another parent, whose cached
        // detail still lists it — refetch every cached detail, not just this one.
        await Promise.all([mutate(isTaskDetailKey), refreshTaskList()]);
      },
      taskId: detailId!,
      title: t('taskDetail.subIssue.addExistingTitle', { ns: 'chat' }),
    });
  }, [canAddExistingSubIssues, detailId, detailIdentifier, domainRevision, refreshTaskList]);

  const addResource = useCallback(
    (kind: IssueResourceKind) => {
      if (!capabilities.canAddResource || !resourceRef) return;
      openTaskIssueResourceModal({
        kind,
        onChanged: async () => {
          await Promise.all([
            taskId ? refreshTaskDetail(taskId) : undefined,
            mutate(['issue-resources', resourceRef]),
          ]);
        },
        taskId: resourceRef,
      });
    },
    [capabilities.canAddResource, refreshTaskDetail, taskId, resourceRef],
  );

  return { addExistingSubIssues, addResource, canAddExistingSubIssues, capabilities };
};
