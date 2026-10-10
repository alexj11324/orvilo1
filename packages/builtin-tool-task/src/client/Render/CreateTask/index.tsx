'use client';
import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { PanelRight, PanelRightClose } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import IssueStatusPicker from '@/features/AgentTasks/features/IssueStatusPicker';
import TaskPriorityTag from '@/features/AgentTasks/features/TaskPriorityTag';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import type { CreateTaskParams, CreateTaskState } from '../../../types';

const styles = {
  description: 'line-clamp-3 text-[12px] leading-[1.5] text-[var(--ant-color-text-tertiary)]',
  identifier:
    'shrink-0 rounded-[4px] bg-accent px-1.5 py-px font-mono text-[12px] text-muted-foreground',
  // Fade the model-facing markdown preview; the detail panel contains the full content.
  instruction:
    'max-h-[132px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_78%,transparent)]',
  row: 'flex items-center gap-2',
  taskItem: 'flex flex-col gap-1.5 px-3 py-2.5',
  title: 'min-w-0 flex-1 truncate text-[13px] leading-[1.4] text-foreground',
};

export const CreateTaskRender = memo<BuiltinRenderProps<CreateTaskParams, CreateTaskState>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('chat');
    const [activeTaskDetailId, showTaskDetail, openTaskDetail, closeTaskDetail] = useChatStore(
      (s) => [
        chatPortalSelectors.taskDetailId(s),
        chatPortalSelectors.showTaskDetail(s),
        s.openTaskDetail,
        s.closeTaskDetail,
      ],
    );

    const identifier = pluginState?.identifier;
    // Auto-expanding the freshly created task's detail portal is driven by the
    // executor's `onAfterCall` hook (gateway `tool_end`), not a render effect —
    // see `client/executor`. The card itself only handles the manual toggle.

    // Prefer the resolved task (`pluginState`); fall back to `args` while the
    // call is still streaming and no result has landed yet.
    const name = pluginState?.name ?? args?.name;

    if (!name && !identifier) return null;

    const status = pluginState?.status;
    const priority = pluginState?.priority ?? undefined;
    const description = pluginState?.description;
    const instruction = args?.instruction;
    const parent = pluginState?.parentIdentifier ?? args?.parentIdentifier;
    const isExpanded = !!identifier && showTaskDetail && activeTaskDetailId === identifier;

    const toggle = () => {
      if (!identifier) return;
      if (isExpanded) closeTaskDetail();
      else openTaskDetail(identifier);
    };

    return (
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--sidebar-border)',
          borderRadius: 'var(--ant-border-radius)',
          width: '100%',
        }}
        onClick={identifier ? () => openTaskDetail(identifier) : undefined}
      >
        <div className={styles.taskItem}>
          <div className={styles.row}>
            {identifier && <span className={styles.identifier}>{identifier}</span>}
            {name && <div className={styles.title}>{name}</div>}
            {/* The Issue Status mark — read-only on a tool card. */}
            {status && (
              <IssueStatusPicker
                disableDropdown
                size={14}
                workflowCategory={pluginState?.workflowCategory}
              />
            )}
            {!!priority && <TaskPriorityTag disableDropdown priority={priority} size={14} />}
            {identifier && (
              <ActionIcon
                active={isExpanded}
                icon={isExpanded ? PanelRightClose : PanelRight}
                size={'small'}
                title={t(isExpanded ? 'taskDetail.closeDetail' : 'taskDetail.openDetail')}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
              />
            )}
          </div>
          {description ? (
            <div className={styles.description}>{description}</div>
          ) : instruction ? (
            <div className={styles.instruction}>
              <Markdown fontSize={12} variant={'chat'}>
                {instruction}
              </Markdown>
            </div>
          ) : null}
          {parent && (
            <span className="text-[11px]" style={{ color: 'var(--ant-color-text-tertiary)' }}>
              {`Subtask of ${parent}`}
            </span>
          )}
        </div>
      </div>
    );
  },
);

CreateTaskRender.displayName = 'CreateTaskRender';

export default CreateTaskRender;
