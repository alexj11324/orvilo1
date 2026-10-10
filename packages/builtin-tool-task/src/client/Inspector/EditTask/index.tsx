'use client';

import { priorityLabel } from '@orvilo/prompts';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import AssigneeUserAvatar from '@/features/AgentTasks/features/AssigneeUserAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import { useUserDisplayMeta } from '@/features/AgentTasks/shared/useUserDisplayMeta';
import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { EditTaskParams, EditTaskState } from '../../../types';

const styles = {
  addChip:
    'shrink-0 rounded-[999px] bg-[var(--ant-color-success-bg)] px-2 py-px font-mono text-[12px] text-success',
  assigneeAvatar: 'shrink-0',
  assigneeChip:
    'inline-flex min-w-0 max-w-[220px] shrink items-center gap-1.5 overflow-hidden rounded-[999px] bg-accent py-px ps-1 pe-2 text-[12px] text-foreground',
  assigneeName: 'truncate',
  chip: 'inline-flex min-w-0 max-w-[200px] shrink items-center truncate rounded-[999px] bg-accent px-2 py-px text-[12px] text-foreground',
  group: 'inline-flex flex-wrap items-center gap-1',
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-px font-mono text-[12px] text-muted-foreground',
  label: 'shrink-0 text-[12px] text-[var(--ant-color-text-tertiary)]',
  removeChip:
    'shrink-0 rounded-[999px] border border-dashed border-[var(--ant-color-error-border)] bg-transparent px-2 py-px font-mono text-[12px] text-destructive line-through',
};

const AssigneeChip = memo<{ agentId: string }>(({ agentId }) => {
  const agentMeta = useAgentDisplayMeta(agentId, { fallbackToDefault: false });
  const displayName = agentMeta?.title || agentId;

  return (
    <span className={styles.assigneeChip} title={displayName}>
      <span className={styles.assigneeAvatar}>
        <AssigneeAvatar agentId={agentId} fallbackToDefault={false} size={16} />
      </span>
      <span className={styles.assigneeName}>{displayName}</span>
    </span>
  );
});

AssigneeChip.displayName = 'AssigneeChip';

const MemberChip = memo<{ userId: string }>(({ userId }) => {
  const meta = useUserDisplayMeta(userId);
  const displayName = meta?.title || userId;

  return (
    <span className={styles.assigneeChip} data-testid="member-chip" title={displayName}>
      <span className={styles.assigneeAvatar}>
        <AssigneeUserAvatar size={16} userId={userId} />
      </span>
      <span className={styles.assigneeName}>{displayName}</span>
    </span>
  );
});

MemberChip.displayName = 'MemberChip';

export const EditTaskInspector = memo<BuiltinInspectorProps<EditTaskParams, EditTaskState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');

    const params = args || partialArgs || ({} as Partial<EditTaskParams>);
    const identifier = params.identifier;

    const segments: { content: ReactNode; key: string }[] = [];

    if (params.name !== undefined) {
      segments.push({
        content: (
          <>
            <span className={styles.label}>{t('builtins.orvilo-task.edit.rename')}</span>
            <span className={styles.chip}>{params.name}</span>
          </>
        ),
        key: 'name',
      });
    }

    if (params.priority !== undefined) {
      segments.push({
        content: (
          <>
            <span className={styles.label}>{t('builtins.orvilo-task.edit.priority')}</span>
            <span className={styles.chip}>{priorityLabel(params.priority)}</span>
          </>
        ),
        key: 'priority',
      });
    }

    if (params.instruction !== undefined) {
      segments.push({
        content: <span className={styles.chip}>{t('builtins.orvilo-task.edit.instruction')}</span>,
        key: 'instruction',
      });
    }

    if (params.description !== undefined) {
      segments.push({
        content: <span className={styles.chip}>{t('builtins.orvilo-task.edit.description')}</span>,
        key: 'description',
      });
    }

    if (params.parentIdentifier !== undefined) {
      segments.push({
        content:
          params.parentIdentifier === null ? (
            <span className={styles.chip}>{t('builtins.orvilo-task.edit.parentClear')}</span>
          ) : (
            <>
              <span className={styles.label}>{t('builtins.orvilo-task.edit.parent')}</span>
              <span className={styles.chip}>{params.parentIdentifier}</span>
            </>
          ),
        key: 'parent',
      });
    }

    if (params.assigneeAgentId !== undefined || params.assigneeUserId !== undefined) {
      // Executing agent and human owner are independent sides that can change
      // (and be set) together — render a chip per assigned side; a call that
      // only clears reads as unassign.
      const hasAnyAssignee = Boolean(params.assigneeAgentId || params.assigneeUserId);
      segments.push({
        content: hasAnyAssignee ? (
          <>
            <span className={styles.label}>{t('builtins.orvilo-task.edit.assign')}</span>
            {params.assigneeAgentId && <AssigneeChip agentId={params.assigneeAgentId} />}
            {params.assigneeUserId && <MemberChip userId={params.assigneeUserId} />}
          </>
        ) : (
          <span className={styles.chip}>{t('builtins.orvilo-task.edit.unassign')}</span>
        ),
        key: 'assignee',
      });
    }

    if (params.addDependencies?.length) {
      segments.push({
        content: (
          <>
            <span className={styles.label}>{t('builtins.orvilo-task.edit.blocksOn')}</span>
            {params.addDependencies.map((dep) => (
              <span className={styles.addChip} key={`add-${dep}`}>
                {dep}
              </span>
            ))}
          </>
        ),
        key: 'addDeps',
      });
    }

    if (params.removeDependencies?.length) {
      segments.push({
        content: (
          <>
            <span className={styles.label}>{t('builtins.orvilo-task.edit.unblocks')}</span>
            {params.removeDependencies.map((dep) => (
              <span className={styles.removeChip} key={`remove-${dep}`}>
                {dep}
              </span>
            ))}
          </>
        ),
        key: 'removeDeps',
      });
    }

    return (
      <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-task.apiName.editTask')}
        </span>
        {identifier && <span className={styles.identifierChip}>{identifier}</span>}
        {segments.map((segment, index) => (
          <span className={styles.group} key={segment.key}>
            {index > 0 && <span style={{ color: 'var(--ant-color-text-quaternary)' }}>·</span>}
            {segment.content}
          </span>
        ))}
      </div>
    );
  },
);

EditTaskInspector.displayName = 'EditTaskInspector';

export default EditTaskInspector;
