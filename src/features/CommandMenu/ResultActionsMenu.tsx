import { copyToClipboard, Icon } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { PROJECT_CREATABLE_STATUSES } from '@orvilo/types';
import { Command } from 'cmdk';
import {
  BarChart3Icon,
  ChevronRightIcon,
  CircleDashedIcon,
  CornerDownLeftIcon,
  LinkIcon,
  UserRoundPlusIcon,
} from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { getPriorityIconColor, PRIORITY_LEVELS } from '@/components/PriorityIcon';
import { PRIORITY_META } from '@/features/AgentTasks/features/TaskPriorityTag';
import {
  STATUS_META,
  USER_SELECTABLE_STATUSES,
} from '@/features/AgentTasks/features/taskStatusMeta';
import { useTaskStatusChange } from '@/features/AgentTasks/features/useTaskStatusChange';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { projectService } from '@/services/project';
import { useTaskStore } from '@/store/task';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useCommandMenuContext } from './CommandMenuContext';
import { styles } from './styles';
import {
  isResultActionsPage,
  RESULT_ACTIONS_PAGE,
  RESULT_PRIORITY_PAGE,
  RESULT_STATUS_PAGE,
  resultDetailPath,
} from './utils/resultActions';

interface ActionEntry {
  disabled?: boolean;
  icon: ReactNode;
  key: string;
  label: string;
  run: () => void;
  /** Opens a drill-down page instead of performing the mutation inline. */
  submenu?: boolean;
}

const itemValue = (key: string) => `result-action ${key}`;

/**
 * Linear-style "act on a result without leaving the palette": the action
 * submenu for the highlighted task/project search result. Rendered on the
 * `result-actions*` pages; `actionTarget` in context names the row.
 */
const ResultActionsMenu = memo(() => {
  const { t } = useTranslation(['common', 'chat', 'project']);
  const { actionTarget, onClose, page, setPages } = useCommandMenuContext();
  const navigate = useWorkspaceAwareNavigate();
  const appOrigin = useAppOrigin();
  const workspaceSlug = useActiveWorkspaceSlug();
  const { allowed: canEdit } = usePermission('create_content');
  const selfUserId = useUserStore(userProfileSelectors.userId);
  const updateTask = useTaskStore((s) => s.updateTask);
  const changeTaskStatus = useTaskStatusChange();

  // Close first: mutations surface toasts and the status cascade modal mounts
  // outside the palette, so the overlay must not linger over them (same
  // pattern as openCreateProjectModal).
  const runMutation = useCallback(
    (fn: () => Promise<unknown>) => {
      onClose();
      void fn().catch((error: unknown) => {
        console.error('[commandMenu.resultAction]', error);
        toast.error(t('cmdk.resultActions.failed'));
      });
    },
    [onClose, t],
  );

  const rootEntries = useMemo<ActionEntry[]>(() => {
    if (!actionTarget) return [];
    const detailPath = resultDetailPath(actionTarget);
    const pushPage = (next: string) => setPages((prev) => [...prev, next]);

    const entries: ActionEntry[] = [];
    if (detailPath) {
      entries.push(
        {
          icon: <Icon icon={CornerDownLeftIcon} />,
          key: 'open',
          label: t('cmdk.resultActions.open'),
          run: () => {
            navigate(detailPath);
            onClose();
          },
        },
        {
          icon: <Icon icon={LinkIcon} />,
          key: 'copy-link',
          label: t('cmdk.resultActions.copyLink'),
          run: () => {
            onClose();
            void copyToClipboard(
              `${appOrigin}${buildWorkspaceAwarePath(detailPath, workspaceSlug)}`,
            )
              .then(() => toast.success(t('cmdk.resultActions.copyLinkSuccess')))
              .catch((error: unknown) => {
                console.error('[commandMenu.resultAction.copyLink]', error);
                toast.error(t('cmdk.resultActions.failed'));
              });
          },
        },
      );
    }

    if (actionTarget.type === 'task') {
      entries.push(
        {
          icon: <Icon icon={CircleDashedIcon} />,
          key: 'status',
          label: t('cmdk.resultActions.setStatus'),
          run: () => pushPage(RESULT_STATUS_PAGE),
          submenu: true,
        },
        {
          disabled: !canEdit || !selfUserId,
          icon: <Icon icon={UserRoundPlusIcon} />,
          key: 'assign-to-me',
          label: t('cmdk.resultActions.assignToMe'),
          run: () =>
            runMutation(() => updateTask(actionTarget.id, { assigneeUserId: selfUserId! })),
        },
        {
          icon: <Icon icon={BarChart3Icon} />,
          key: 'priority',
          label: t('cmdk.resultActions.setPriority'),
          run: () => pushPage(RESULT_PRIORITY_PAGE),
          submenu: true,
        },
      );
    } else if (actionTarget.type === 'project') {
      entries.push(
        {
          icon: <Icon icon={CircleDashedIcon} />,
          key: 'status',
          label: t('cmdk.resultActions.setStatus'),
          run: () => pushPage(RESULT_STATUS_PAGE),
          submenu: true,
        },
        {
          disabled: !canEdit || !selfUserId,
          icon: <Icon icon={UserRoundPlusIcon} />,
          key: 'lead-to-me',
          label: t('cmdk.resultActions.setLeadToMe'),
          run: () =>
            runMutation(() => projectService.update(actionTarget.id, { leadUserId: selfUserId! })),
        },
        {
          icon: <Icon icon={BarChart3Icon} />,
          key: 'priority',
          label: t('cmdk.resultActions.setPriority'),
          run: () => pushPage(RESULT_PRIORITY_PAGE),
          submenu: true,
        },
      );
    }
    return entries;
  }, [
    actionTarget,
    appOrigin,
    canEdit,
    navigate,
    onClose,
    runMutation,
    selfUserId,
    setPages,
    t,
    updateTask,
    workspaceSlug,
  ]);

  const statusEntries = useMemo<ActionEntry[]>(() => {
    if (!actionTarget) return [];
    if (actionTarget.type === 'task') {
      return USER_SELECTABLE_STATUSES.map((status) => ({
        disabled: !canEdit,
        icon: <Icon color={STATUS_META[status].color} icon={STATUS_META[status].icon} />,
        key: `status-${status}`,
        label: t(`taskDetail.status.${status}`, { ns: 'chat' }),
        run: () =>
          runMutation(async () => {
            await changeTaskStatus(actionTarget.id, status);
          }),
      }));
    }
    if (actionTarget.type === 'project') {
      return PROJECT_CREATABLE_STATUSES.map((status) => ({
        disabled: !canEdit,
        icon: <ProjectStatusIcon size={14} status={status} />,
        key: `status-${status}`,
        label: t(`status.${status}`, { ns: 'project' }),
        run: () => runMutation(() => projectService.updateStatus(actionTarget.id, status)),
      }));
    }
    return [];
  }, [actionTarget, canEdit, changeTaskStatus, runMutation, t]);

  const priorityEntries = useMemo<ActionEntry[]>(() => {
    if (!actionTarget) return [];
    return PRIORITY_LEVELS.map((level) => {
      const meta = PRIORITY_META[level];
      const PriorityIcon = meta.icon;
      return {
        disabled: !canEdit,
        icon: <PriorityIcon color={getPriorityIconColor(level)} size={16} />,
        key: `priority-${level}`,
        label: t(`taskDetail.${meta.labelKey}` as never, { ns: 'chat' }),
        run: () =>
          runMutation(() =>
            actionTarget.type === 'task'
              ? updateTask(actionTarget.id, { priority: level })
              : projectService.update(actionTarget.id, { priority: level }),
          ),
      };
    });
  }, [actionTarget, canEdit, runMutation, t, updateTask]);

  const activeEntries =
    page === RESULT_STATUS_PAGE
      ? statusEntries
      : page === RESULT_PRIORITY_PAGE
        ? priorityEntries
        : page === RESULT_ACTIONS_PAGE
          ? rootEntries
          : [];

  // Action keys: digits 1-9 pick an option inside the status/priority drill-downs
  // (same convention as the task context menu), and → on the root page drills
  // into the highlighted submenu entry. Capture phase so digits never reach the
  // search input.
  const shortcutState = useRef({
    entries: [] as ActionEntry[],
    page: undefined as string | undefined,
  });
  shortcutState.current = { entries: activeEntries, page };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { entries, page: currentPage } = shortcutState.current;

      if (currentPage === RESULT_ACTIONS_PAGE && event.key === 'ArrowRight') {
        const selectedValue = document
          .querySelector('[cmdk-item][aria-selected="true"]')
          ?.getAttribute('data-value');
        const entry = entries.find((item) => item.submenu && itemValue(item.key) === selectedValue);
        if (entry) {
          event.preventDefault();
          event.stopPropagation();
          entry.run();
        }
        return;
      }

      if (currentPage !== RESULT_STATUS_PAGE && currentPage !== RESULT_PRIORITY_PAGE) return;
      const index = Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= entries.length) return;
      const entry = entries[index];
      if (entry.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      entry.run();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  if (!actionTarget || !isResultActionsPage(page)) return null;

  const showDigits = page === RESULT_STATUS_PAGE || page === RESULT_PRIORITY_PAGE;
  const heading =
    page === RESULT_ACTIONS_PAGE
      ? actionTarget.title
      : page === RESULT_STATUS_PAGE
        ? t('cmdk.resultActions.setStatus')
        : t('cmdk.resultActions.setPriority');

  return (
    <Command.Group heading={heading}>
      {activeEntries.map((entry, index) => (
        <Command.Item
          disabled={entry.disabled}
          key={entry.key}
          keywords={[entry.label]}
          value={itemValue(entry.key)}
          onSelect={entry.run}
        >
          <div className={styles.itemIcon}>{entry.icon}</div>
          <div className={styles.itemContent}>
            <div className={styles.itemDetails}>
              <div className={styles.itemTitle}>{entry.label}</div>
            </div>
            {entry.submenu ? (
              <ChevronRightIcon className={styles.icon} />
            ) : showDigits ? (
              <span className={styles.itemType}>{index + 1}</span>
            ) : null}
          </div>
        </Command.Item>
      ))}
    </Command.Group>
  );
});

ResultActionsMenu.displayName = 'ResultActionsMenu';

export default ResultActionsMenu;
