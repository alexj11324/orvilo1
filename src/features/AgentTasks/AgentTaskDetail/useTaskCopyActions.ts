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
import { escapeMarkdownText, markdownLink, taskMarkdownDocument } from './taskMarkdown';

/**
 * Clipboard actions for the active task. Shared by the rail's round quick
 * buttons (`TaskRailActions`) and the header overflow menu so both copy
 * byte-for-byte the same values. The title / Markdown / prompt variants are
 * menu-only.
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
  const taskInstruction = detail?.instruction;
  // A detail host can be mounted by UUID; what leaves the app is always the
  // readable identifier once it is known.
  const taskRef = taskIdentifier ?? taskId;
  // A task only gets a `task/<identifier>` branch when it is bound to a repo
  // workspace — the runner provisions a worktree there. Without the binding
  // there is no branch to copy, so the action hides rather than inventing one.
  const hasBranch = useTaskDetailSelector(
    (s, scopedTaskId) => !!taskDetailSelectors.taskDetail(s, scopedTaskId)?.config?.workspace,
  );

  const copyId = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(taskRef ?? taskId);
    toast.success(t('taskList.contextMenu.copyIdSuccess'));
  }, [taskId, taskRef, t]);

  // Carry the title into the copied link so a pasted URL says what the task is.
  // The URL is app origin + route only; the title enters solely as a slug.
  const taskPath = taskRef ? taskDetailPath(taskRef, taskAgentId ?? undefined, taskTitle) : '';
  const taskUrl = taskId
    ? `${appOrigin}${buildWorkspaceAwarePath(taskPath, activeWorkspaceSlug)}`
    : '';
  // An untitled task still needs link text, so it falls back to its readable id.
  const title = taskTitle || taskRef || '';

  const copyLink = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(taskUrl);
    toast.success(t('taskList.contextMenu.copyLinkSuccess'));
  }, [taskId, taskUrl, t]);

  const copyTitle = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(title);
    toast.success(t('taskList.contextMenu.copyTitleSuccess'));
  }, [taskId, title, t]);

  const copyTitleAsLink = useCallback(async () => {
    if (!taskId) return;

    await navigator.clipboard.writeText(markdownLink(title, taskUrl));
    toast.success(t('taskList.contextMenu.copyLinkSuccess'));
  }, [taskId, title, taskUrl, t]);

  const copyMarkdown = useCallback(async () => {
    if (!taskId) return;

    const markdown = taskMarkdownDocument({
      identifier: taskRef ?? taskId,
      instruction: taskInstruction,
      title,
      url: taskUrl,
    });
    await navigator.clipboard.writeText(markdown);
    toast.success(t('taskList.contextMenu.copyMarkdownSuccess'));
  }, [taskId, taskRef, title, taskInstruction, taskUrl, t]);

  // Everything a reader of this issue can already see, as one document:
  // the issue itself, its attached links, relations, sub-issues, documents
  // and comments. Titles are user text, so each goes through the same
  // escaping as the single-issue Markdown; comment bodies are the authors'
  // own Markdown and are carried verbatim. Rejects when the link list cannot
  // be read — the caller reports it.
  const copyEverything = useCallback(async () => {
    if (!taskId) return;

    const resources = await taskMenuService.links(detail?.id ?? taskId);
    const sections = [
      taskMarkdownDocument({
        identifier: taskRef ?? taskId,
        instruction: taskInstruction,
        title,
        url: taskUrl,
      }),
      ...resources.data.map((link) => markdownLink(link.title ?? link.url, link.url)),
      ...(detail?.dependencies ?? []).map((edge) =>
        escapeMarkdownText(`${edge.type}: ${edge.dependsOn} ${edge.name ?? ''}`),
      ),
      ...(detail?.subtasks ?? []).map((child) =>
        escapeMarkdownText(`${child.identifier}: ${child.name ?? ''}`),
      ),
      ...(detail?.workspace ?? [])
        .filter((doc) => !doc.inaccessible)
        .map((doc) => escapeMarkdownText(doc.title ?? '')),
      ...(detail?.activities ?? [])
        .filter((activity) => activity.type === 'comment')
        .map((activity) => activity.content ?? ''),
    ];
    await navigator.clipboard.writeText(sections.filter(Boolean).join('\n\n'));
    toast.success(t('copySuccess', { ns: 'common' }));
  }, [taskId, taskRef, detail, taskInstruction, title, taskUrl, t]);

  // A plain-text brief to paste into an agent: what to work on, the
  // description, and where the issue lives.
  const copyPrompt = useCallback(async () => {
    if (!taskId) return;

    const prompt = [
      `Work on ${taskRef ?? taskId}: ${title}`,
      taskInstruction?.trim(),
      `Issue: ${taskUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(prompt);
    toast.success(t('copySuccess', { ns: 'common' }));
  }, [taskId, taskRef, title, taskInstruction, taskUrl, t]);

  // The convention is fixed in TaskWorkspaceConfig: every provisioned run works
  // on `task/<identifier>` — copying it matches Linear's "copy git branch".
  const copyBranch = useCallback(async () => {
    if (!taskIdentifier) return;

    await navigator.clipboard.writeText(`task/${taskIdentifier}`);
    toast.success(t('taskDetail.copyBranchSuccess'));
  }, [taskIdentifier, t]);

  return {
    copyBranch,
    copyEverything,
    copyId,
    copyLink,
    copyMarkdown,
    copyPrompt,
    copyTitle,
    copyTitleAsLink,
    hasBranch: hasBranch && !!taskIdentifier,
    taskId,
    /** Workspace-unaware route to this task — for in-app navigation. */
    taskPath,
  };
};
