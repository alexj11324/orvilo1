'use client';

import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import { PanelRight, PanelRightClose } from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import AssigneeUserAvatar from '@/features/AgentTasks/features/AssigneeUserAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import { useUserDisplayMeta } from '@/features/AgentTasks/shared/useUserDisplayMeta';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const styles = {
  assignee: 'inline-flex min-w-0 max-w-full items-center gap-1.5',
  assigneeName: 'truncate text-[13px] text-foreground',
  body: 'flex flex-col gap-2.5 p-3',
  header: 'flex items-center gap-2 px-3 py-2.5',
  headerDivider: '[border-block-end:1px_solid_var(--sidebar-border)]',
  identifier:
    'shrink-0 rounded-[4px] bg-accent px-1.5 py-px font-mono text-[12px] text-muted-foreground',
  inlineRow: 'flex min-w-0 items-center gap-2',
  inlineValue: 'min-w-0 flex-1 overflow-hidden text-[13px] text-foreground',
  label: 'shrink-0 text-[12px] text-[var(--ant-color-text-tertiary)]',
  mono: 'font-mono text-[12px] text-muted-foreground',
  section: 'flex min-w-0 flex-col gap-1',
  sectionValue: 'text-[13px] leading-[1.6] text-muted-foreground [overflow-wrap:anywhere]',
  spacer: 'flex-1',
  title: 'text-[13px] font-medium text-foreground',
};

/**
 * Shared open/close wiring for a task's detail portal, reused by every
 * single-task result card so clicking a card (or its toggle) reveals the full
 * task in the right-side panel.
 */
export const useTaskDetailToggle = (identifier?: string) => {
  const [activeTaskDetailId, showTaskDetail, openTaskDetail, closeTaskDetail] = useChatStore(
    (s) => [
      chatPortalSelectors.taskDetailId(s),
      chatPortalSelectors.showTaskDetail(s),
      s.openTaskDetail,
      s.closeTaskDetail,
    ],
  );

  const canOpen = !!identifier;
  const isExpanded = canOpen && showTaskDetail && activeTaskDetailId === identifier;

  const open = () => {
    if (identifier) openTaskDetail(identifier);
  };

  const toggle = () => {
    if (!identifier) return;
    if (isExpanded) closeTaskDetail();
    else openTaskDetail(identifier);
  };

  return { canOpen, isExpanded, open, toggle };
};

interface TaskResultCardProps {
  children?: ReactNode;
  /** Inline status/extra slot rendered in the header, after the identifier chip. */
  headerExtra?: ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  identifier?: string;
  title: ReactNode;
}

/**
 * Outlined card shell shared by the single-task mutation renders (edit / run /
 * verify): a header line with operation icon, title and identifier chip plus an
 * optional body of detail fields. The whole card opens the task detail portal.
 */
export const TaskResultCard = memo<TaskResultCardProps>(
  ({ children, headerExtra, icon, iconColor, identifier, title }) => {
    const { t } = useTranslation('chat');
    const { canOpen, isExpanded, open, toggle } = useTaskDetailToggle(identifier);

    return (
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--sidebar-border)',
          borderRadius: 'var(--ant-border-radius)',
          width: '100%',
        }}
        onClick={canOpen ? open : undefined}
      >
        <div className={cn(styles.header, !!children && styles.headerDivider)}>
          {icon &&
            createElement(icon, {
              size: 15,
              style: { color: iconColor ?? 'var(--muted-foreground)' },
            })}
          <div className={styles.title}>{title}</div>
          {identifier && <span className={styles.identifier}>{identifier}</span>}
          {headerExtra}
          <div className={styles.spacer} />
          {canOpen && (
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
        {children && <div className={styles.body}>{children}</div>}
      </div>
    );
  },
);

TaskResultCard.displayName = 'TaskResultCard';

/** A scalar detail row: muted label followed by an inline value. */
export const InlineField = memo<{ children: ReactNode; label: ReactNode }>(
  ({ children, label }) => (
    <div className={styles.inlineRow}>
      <span className={styles.label}>{label}</span>
      <div className={styles.inlineValue}>{children}</div>
    </div>
  ),
);

InlineField.displayName = 'InlineField';

/** A stacked detail block: muted label above long-form content. */
export const SectionField = memo<{ children: ReactNode; label: ReactNode }>(
  ({ children, label }) => (
    <div className={styles.section}>
      <span className={styles.label}>{label}</span>
      <div className={styles.sectionValue}>{children}</div>
    </div>
  ),
);

SectionField.displayName = 'SectionField';

/** An agent avatar + display name, resolved from the agent registry. */
export const AssigneeInline = memo<{ agentId: string }>(({ agentId }) => {
  const agentMeta = useAgentDisplayMeta(agentId, { fallbackToDefault: false });
  const displayName = agentMeta?.title || agentId;

  return (
    <span className={styles.assignee} title={displayName}>
      <AssigneeAvatar agentId={agentId} fallbackToDefault={false} size={18} />
      <span className={styles.assigneeName}>{displayName}</span>
    </span>
  );
});

AssigneeInline.displayName = 'AssigneeInline';

/** A workspace member avatar + display name — the human twin of `AssigneeInline`. */
export const MemberAssigneeInline = memo<{ userId: string }>(({ userId }) => {
  const meta = useUserDisplayMeta(userId);
  const displayName = meta?.title || userId;

  return (
    <span className={styles.assignee} title={displayName}>
      <AssigneeUserAvatar size={18} userId={userId} />
      <span className={styles.assigneeName}>{displayName}</span>
    </span>
  );
});

MemberAssigneeInline.displayName = 'MemberAssigneeInline';

export const monoChipClassName = styles.mono;
