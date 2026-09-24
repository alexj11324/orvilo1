import { type DropdownItem, DropdownMenu, Icon, type MenuInfo, Tooltip } from '@lobehub/ui';
import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';

import { renderMenuExtra } from './menuExtra';
import { STATUS_META, USER_SELECTABLE_STATUSES } from './taskStatusMeta';
import { useTaskStatusChange } from './useTaskStatusChange';

export { STATUS_META, USER_SELECTABLE_STATUSES } from './taskStatusMeta';

const styles = createStaticStyles(({ css, cssVar }) => ({
  searchInput: css`
    width: 100%;
    padding-block: 4px;
    padding-inline: 10px;
    border: none;

    font-family: inherit;
    font-size: 13px;
    color: ${cssVar.colorText};

    background: transparent;
    outline: none;

    &::placeholder {
      color: ${cssVar.colorTextPlaceholder};
    }
  `,
  showingCaption: css`
    padding-block: 2px;
    padding-inline: 10px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  trigger: css`
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: filter ${cssVar.motionDurationMid};

    &:hover {
      filter: brightness(0.85);
    }
  `,
  triggerDisabled: css`
    cursor: not-allowed;
    display: inline-flex;
    opacity: 0.5;

    &:hover {
      filter: none;
    }
  `,
}));

interface TaskStatusTagProps {
  children?: ReactNode;
  disableDropdown?: boolean;
  onChange?: (status: TaskStatus) => void | Promise<void>;
  size?: number;
  status?: TaskStatus;
  taskIdentifier?: string;
}

const TaskStatusTag = memo<TaskStatusTagProps>(
  ({ children, disableDropdown, onChange, size = 16, status, taskIdentifier }) => {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { t } = useTranslation('chat');
    const { allowed: canEditTask, reason } = usePermission('create_content');
    const changeTaskStatus = useTaskStatusChange();

    const displayStatus = status ?? 'backlog';
    const meta = STATUS_META[displayStatus];

    // Linear's status menu carries a search field on top; letters filter the
    // list while digits keep working as accelerators (the document handler
    // captures them before they reach the input).
    const statusLabel = useCallback(
      (key: TaskStatus) =>
        t(`taskDetail.${STATUS_META[key].labelKey}`, { defaultValue: STATUS_META[key].label }),
      [t],
    );
    const filteredStatuses = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return USER_SELECTABLE_STATUSES;
      return USER_SELECTABLE_STATUSES.filter((key) =>
        statusLabel(key).toLowerCase().includes(needle),
      );
    }, [query, statusLabel]);

    useEffect(() => {
      if (!open) setQuery('');
    }, [open]);

    const handleStatusChange = useCallback(
      async (nextStatus: TaskStatus) => {
        if (!canEditTask) return;
        if (nextStatus === displayStatus) return;
        if (onChange) {
          setLoading(true);
          try {
            await onChange(nextStatus);
          } finally {
            setLoading(false);
          }
          return;
        }
        if (!taskIdentifier) return;
        setLoading(true);

        try {
          await changeTaskStatus(taskIdentifier, nextStatus);
        } finally {
          setLoading(false);
        }
      },
      [canEditTask, changeTaskStatus, displayStatus, onChange, taskIdentifier],
    );

    const handleStatusChangeRef = useRef(handleStatusChange);
    handleStatusChangeRef.current = handleStatusChange;
    const filteredStatusesRef = useRef(filteredStatuses);
    filteredStatusesRef.current = filteredStatuses;

    useEffect(() => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const num = Number.parseInt(event.key, 10);
        if (Number.isNaN(num)) return;
        const statuses = filteredStatusesRef.current;
        const idx = num - 1;
        if (idx < 0 || idx >= statuses.length) return;
        event.preventDefault();
        event.stopPropagation();
        void handleStatusChangeRef.current(statuses[idx]);
        setOpen(false);
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [open]);

    const menuItems = useMemo<DropdownItem[]>(
      () =>
        filteredStatuses.map((key, index) => {
          const statusMeta = STATUS_META[key];
          const isCurrent = key === displayStatus;
          return {
            extra: renderMenuExtra(String(index + 1), isCurrent),
            icon: <Icon color={statusMeta.color} icon={statusMeta.icon} size={16} />,
            key,
            label: statusLabel(key),
            onClick: ({ domEvent }: MenuInfo) => {
              domEvent.stopPropagation();
              void handleStatusChange(key);
            },
          };
        }),
      [displayStatus, filteredStatuses, handleStatusChange, statusLabel],
    );

    const triggerNode =
      children ||
      (loading ? (
        <Icon spin color={cssVar.colorTextDescription} icon={Loader2Icon} size={size} />
      ) : (
        <Tooltip title={t(`taskDetail.${meta.labelKey}`, { defaultValue: meta.label })}>
          <span className={styles.trigger} onClick={(e) => e.stopPropagation()}>
            <Icon color={meta.color} icon={meta.icon} size={size} />
          </span>
        </Tooltip>
      ));

    if (disableDropdown) return <>{triggerNode}</>;

    if (!canEditTask)
      return (
        <Tooltip title={reason}>
          <span className={styles.triggerDisabled} onClick={(e) => e.stopPropagation()}>
            {triggerNode}
          </span>
        </Tooltip>
      );

    return (
      <DropdownMenu
        items={menuItems}
        open={open}
        header={
          <>
            <input
              autoFocus
              className={styles.searchInput}
              value={query}
              aria-label={t('taskDetail.changeStatusPlaceholder', {
                defaultValue: 'Change status…',
              })}
              placeholder={t('taskDetail.changeStatusPlaceholder', {
                defaultValue: 'Change status…',
              })}
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className={styles.showingCaption}>
              {query.trim()
                ? t('taskDetail.showingItems', {
                    count: filteredStatuses.length,
                    defaultValue: 'Showing {{count}} items',
                  })
                : t('taskDetail.showingAllItems', { defaultValue: 'Showing all items' })}
            </div>
          </>
        }
        onOpenChange={setOpen}
      >
        {triggerNode}
      </DropdownMenu>
    );
  },
);

export default TaskStatusTag;
