import type { TaskLabelSummary } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { CheckIcon, PlusIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { toast } from '@/components/toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { resolveLabelColor } from '@/features/Labels/labelColor';
import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { taskLabelKeys } from '@/libs/swr/keys';
import { taskLabelService } from '@/services/taskLabel';
import { useTaskStore } from '@/store/task';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import {
  blockedPickerContentStyle,
  blockedPickerTriggerStyle,
  pickerTriggerStyle,
} from './pickerTriggerStyles';
import { SimpleTooltip } from './SimpleTooltip';

interface TaskLabelSelectorProps {
  /**
   * Labels currently on the task — they render checked and clicking a row
   * toggles it off. Passed in (not read from the store) so the selector can
   * sit on any surface that already holds the label set.
   */
  assignedLabels: readonly TaskLabelSummary[];
  children: ReactNode;
  disabled?: boolean;
  /** Identifier or id — the label model resolves either under the caller's scope. */
  taskIdentifier: string;
}

type LabelOption =
  | { key: string; kind: 'create'; name: string }
  | { key: string; kind: 'label'; label: TaskLabelSummary };

const styles = createStaticStyles(({ css }) => ({
  searchInput: css`
    width: 100%;
    padding-block: 6px;
    padding-inline: 10px;
    border: none;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-family: inherit;
    font-size: 13px;
    color: ${cssVar.colorText};

    background: transparent;
    outline: none;

    &::placeholder {
      color: ${cssVar.colorTextPlaceholder};
    }
  `,
}));

/** tRPC surfaces the router's CONFLICT as `error.data.code`. */
const isConflictError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { data?: { code?: string } }).data?.code === 'CONFLICT';

/**
 * Linear's issue-label picker: a popover over the scope's label registry
 * (workspace-shared, or personal) with search, click-to-toggle rows and an
 * inline "Create label" entry when the query matches nothing. Toggling is
 * multi-select — the popover stays open so several labels can flip in one go.
 */
const TaskLabelSelector = memo<TaskLabelSelectorProps>(
  ({ assignedLabels, children, disabled, taskIdentifier }) => {
    const { t } = useTranslation('chat');
    const { allowed: canEditTask, reason } = usePermission('create_content');
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [creating, setCreating] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const toggleTaskLabel = useTaskStore((s) => s.toggleTaskLabel);
    const isLogin = useUserStore(authSelectors.isLogin);
    const activeWorkspaceId = useActiveWorkspaceId();
    const {
      data: registryData,
      isLoading,
      mutate: mutateRegistry,
    } = useClientDataSWR(isLogin ? taskLabelKeys.list(isLogin, activeWorkspaceId) : null, () =>
      taskLabelService.getLabels(),
    );
    const registry = useMemo(() => registryData ?? [], [registryData]);

    const assignedIds = useMemo(
      () => new Set(assignedLabels.map((label) => label.id)),
      [assignedLabels],
    );
    const query = search.trim();
    const filtered = useMemo(
      () =>
        query
          ? registry.filter((label) => label.name.toLowerCase().includes(query.toLowerCase()))
          : registry,
      [query, registry],
    );
    // "Create" is offered only when the typed name is genuinely new — a
    // case-insensitive exact match means the picker row already is the label.
    const exactMatch = query
      ? registry.some((label) => label.name.trim().toLowerCase() === query.toLowerCase())
      : true;
    const flatOptions = useMemo<LabelOption[]>(
      () => [
        ...filtered.map((label) => ({ key: label.id, kind: 'label', label }) as const),
        ...(query && !exactMatch
          ? [{ key: '__create__', kind: 'create', name: query } as const]
          : []),
      ],
      [exactMatch, filtered, query],
    );

    useEffect(() => {
      setActiveIndex(0);
    }, [query]);

    useEffect(() => {
      const active = listRef.current?.querySelector<HTMLElement>(
        `[data-label-index="${activeIndex}"]`,
      );
      active?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const handleToggle = useCallback(
      async (label: TaskLabelSummary) => {
        try {
          await toggleTaskLabel(taskIdentifier, label.id, !assignedIds.has(label.id), {
            color: label.color,
            id: label.id,
            name: label.name,
          });
        } catch {
          toast.error(t('taskDetail.labels.updateFailed'));
        }
      },
      [assignedIds, t, taskIdentifier, toggleTaskLabel],
    );

    const handleCreate = useCallback(
      async (name: string) => {
        if (creating) return;
        setCreating(true);
        try {
          const created = await taskLabelService.createLabel({ name });
          void mutateRegistry();
          await toggleTaskLabel(taskIdentifier, created.id, true, {
            color: created.color,
            id: created.id,
            name: created.name,
          });
          setSearch('');
        } catch (error) {
          // A teammate can win the create race — the name is unique per scope,
          // so the existing row is the label the user meant. Recover by
          // assigning it instead of surfacing a false failure.
          if (isConflictError(error)) {
            try {
              const refreshed = await taskLabelService.getLabels();
              void mutateRegistry(refreshed, { revalidate: false });
              const existing = refreshed.find(
                (label) => label.name.trim().toLowerCase() === name.toLowerCase(),
              );
              if (existing) {
                await toggleTaskLabel(taskIdentifier, existing.id, true, {
                  color: existing.color,
                  id: existing.id,
                  name: existing.name,
                });
                setSearch('');
                return;
              }
            } catch {
              // fall through to the error toast
            }
          }
          toast.error(t('taskDetail.labels.createFailed'));
        } finally {
          setCreating(false);
        }
      },
      [creating, mutateRegistry, t, taskIdentifier, toggleTaskLabel],
    );

    const handleSelect = useCallback(
      (option: LabelOption) =>
        option.kind === 'create' ? void handleCreate(option.name) : void handleToggle(option.label),
      [handleCreate, handleToggle],
    );

    const handleSearchKeyDown = useCallback(
      (event: KeyboardEvent<HTMLInputElement>) => {
        if (flatOptions.length === 0) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % flatOptions.length);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveIndex((index) => (index - 1 + flatOptions.length) % flatOptions.length);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const target = flatOptions[activeIndex];
          if (target) handleSelect(target);
        }
      },
      [activeIndex, flatOptions, handleSelect],
    );

    const blocked = disabled || !canEditTask;

    if (blocked)
      return (
        <SimpleTooltip title={disabled ? t('taskDetail.labels.disabled') : reason}>
          <div style={blockedPickerTriggerStyle} onClick={(event) => event.stopPropagation()}>
            <span style={blockedPickerContentStyle}>{children}</span>
          </div>
        </SimpleTooltip>
      );

    return (
      <Popover>
        <PopoverTrigger
          nativeButton={false}
          render={
            <div style={pickerTriggerStyle} onClick={(event) => event.stopPropagation()}>
              {children}
            </div>
          }
        />
        <PopoverContent
          align="start"
          className="w-65 gap-0 p-0"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            autoFocus
            aria-label={t('taskDetail.labels.searchPlaceholder')}
            className={styles.searchInput}
            placeholder={t('taskDetail.labels.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {isLoading ? (
            <SkeletonList rows={4} />
          ) : flatOptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-4">
              <div className="text-xs text-muted-foreground">{t('taskDetail.labels.empty')}</div>
            </div>
          ) : (
            <div
              className="flex w-full flex-col gap-1 overflow-y-auto p-2"
              ref={listRef}
              style={{ maxHeight: '50vh' }}
            >
              {flatOptions.map((option, index) => (
                <div
                  data-label-index={index}
                  key={option.key}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {option.kind === 'create' ? (
                    <NavItem
                      active={index === activeIndex}
                      icon={PlusIcon}
                      loading={creating}
                      style={{ flexShrink: 0 }}
                      title={t('taskDetail.labels.create', { name: option.name })}
                      onClick={() => void handleCreate(option.name)}
                    />
                  ) : (
                    <NavItem
                      active={index === activeIndex}
                      style={{ flexShrink: 0 }}
                      title={option.label.name}
                      extra={
                        assignedIds.has(option.label.id) ? (
                          <CheckIcon size={14} style={{ color: cssVar.colorTextDescription }} />
                        ) : undefined
                      }
                      slots={{
                        titlePrefix: (
                          <span
                            aria-hidden
                            className="size-2 flex-none rounded-full"
                            style={{
                              background: resolveLabelColor(option.label.name, option.label.color),
                            }}
                          />
                        ),
                      }}
                      onClick={() => void handleToggle(option.label)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  },
);

TaskLabelSelector.displayName = 'TaskLabelSelector';

export default TaskLabelSelector;
