import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { toast } from '@/components/toast';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { taskMenuService } from '@/services/taskMenu';
import { taskDetailSelectors } from '@/store/task/selectors';

import { taskDetailPath } from '../shared/taskDetailPath';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

/**
 * Clipboard actions for the active task. Shared by the rail's round quick
 * buttons (`TaskRailActions`) and the header overflow menu so both copy
 * byte-for-byte the same values.
 */
export const useTaskCopyActions = () => {
  const { t } = useTranslation(['chat', 'common']);

  const appOrigin = useAppOrigin();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const taskId = useTaskDetailTaskId();
  const taskAgentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const taskTitle = useTaskDetailSelector(taskDetailSelectors.taskName);
  const taskIdentifier = useTaskDetailSelector(
    (s, scopedTaskId) => taskDetailSelectors.taskDetail(s, scopedTaskId)?.identifier,
  );
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  // A task only gets a `task/<identifier>` branch when it is bound to a repo
  // workspace — the runner provisions a worktree there. Without the binding
  // there is no branch to copy, so the action hides rather than inventing one.
  const hasBranch = useTaskDetailSelector(
    (s, scopedTaskId) => !!taskDetailSelectors.taskDetail(s, scopedTaskId)?.config?.workspace,
  );

  const copyId = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(taskIdentifier ?? taskId);
    toast.success(t('taskList.contextMenu.copyIdSuccess'));
  }, [taskId, taskIdentifier, t]);

  const copyLink = useCallback(async () => {
    if (!taskId) return;

    // Carry the title into the copied link so a pasted URL says what the task is.
    const taskUrl = `${appOrigin}${buildWorkspaceAwarePath(
      taskDetailPath(taskIdentifier ?? taskId, taskAgentId ?? undefined, taskTitle),
      activeWorkspaceSlug,
    )}`;

    await navigator.clipboard.writeText(taskUrl);
    toast.success(t('taskList.contextMenu.copyLinkSuccess'));
  }, [taskId, taskIdentifier, taskAgentId, taskTitle, appOrigin, activeWorkspaceSlug, t]);

  // The convention is fixed in TaskWorkspaceConfig: every provisioned run works
  // on `task/<identifier>` — copying it matches Linear's "copy git branch".
  const copyBranch = useCallback(async () => {
    if (!taskIdentifier) return;

    await navigator.clipboard.writeText(`task/${taskIdentifier}`);
    toast.success(t('taskDetail.copyBranchSuccess'));
  }, [taskIdentifier, t]);

  const taskUrl = taskId
    ? `${appOrigin}${buildWorkspaceAwarePath(taskDetailPath(taskIdentifier ?? taskId, taskAgentId ?? undefined, taskTitle), activeWorkspaceSlug)}`
    : '';
  const title = taskTitle || taskIdentifier || taskId || '';
  const issueMarkdown = `# ${taskIdentifier ?? taskId}: ${title}\n\n${detail?.instruction ?? ''}\n\n${taskUrl}`;
  const copyText = async (value: string) => {
    if (!taskId) return;
    await navigator.clipboard.writeText(value);
    toast.success(t('copySuccess', { ns: 'common' }));
  };
  const copyEverything = async () => {
    if (!taskId) return;
    const resources = await taskMenuService.links(detail?.id ?? taskId);
    const comments = (detail?.activities ?? [])
      .filter((activity) => activity.type === 'comment')
      .map((activity) => activity.content ?? '');
    const relations = (detail?.dependencies ?? []).map(
      (edge) => `${edge.type}: ${edge.dependsOn} ${edge.name ?? ''}`,
    );
    const children = (detail?.subtasks ?? []).map(
      (child) => `${child.identifier}: ${child.name ?? ''}`,
    );
    const documents = (detail?.workspace ?? [])
      .filter((doc) => !doc.inaccessible)
      .map((doc) => doc.title ?? '');
    await copyText(
      [
        issueMarkdown,
        ...resources.data.map((link) => `[${link.title ?? link.url}](${link.url})`),
        ...relations,
        ...children,
        ...documents,
        ...comments,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  };
  return {
    copyBranch,
    copyId,
    copyLink,
    copyTitle: () => copyText(title),
    copyTitleAsLink: () => copyText(`[${title}](${taskUrl})`),
    copyMarkdown: () => copyText(issueMarkdown),
    copyEverything,
    copyPrompt: () =>
      copyText(
        `Work on ${taskIdentifier ?? taskId}: ${title}\n\n${detail?.instruction ?? ''}\n\nIssue: ${taskUrl}`,
      ),
    hasBranch: hasBranch && !!taskIdentifier,
    taskId,
  };
};
