'use client';
import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { Pencil } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import TaskPriorityTag from '@/features/AgentTasks/features/TaskPriorityTag';

import type { EditTaskParams, EditTaskState } from '../../../types';
import {
  AssigneeInline,
  InlineField,
  MemberAssigneeInline,
  monoChipClassName,
  SectionField,
  TaskResultCard,
} from '../shared';

const styles = {
  addChip:
    'rounded-[999px] bg-[var(--ant-color-success-bg)] px-2 py-px font-mono text-[12px] text-success',
  deps: 'inline-flex flex-wrap items-center gap-1',
  removeChip:
    'rounded-[999px] border border-dashed border-[var(--ant-color-error-border)] px-2 py-px font-mono text-[12px] text-destructive line-through',
};

export const EditTaskRender = memo<BuiltinRenderProps<EditTaskParams, EditTaskState>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('plugin');

    const params = args ?? ({} as Partial<EditTaskParams>);
    const identifier = pluginState?.identifier ?? params.identifier;

    const hasName = params.name !== undefined;
    const hasPriority = params.priority !== undefined;
    const hasAssignee = params.assigneeAgentId !== undefined || params.assigneeUserId !== undefined;
    const hasParent = params.parentIdentifier !== undefined;
    const hasInstruction = params.instruction !== undefined;
    const hasDescription = params.description !== undefined;
    const hasAddDeps = !!params.addDependencies?.length;
    const hasRemoveDeps = !!params.removeDependencies?.length;

    const hasAnyChange =
      hasName ||
      hasPriority ||
      hasAssignee ||
      hasParent ||
      hasInstruction ||
      hasDescription ||
      hasAddDeps ||
      hasRemoveDeps;

    return (
      <TaskResultCard
        icon={Pencil}
        identifier={identifier}
        title={t('builtins.orvilo-task.apiName.editTask')}
      >
        {hasAnyChange ? (
          <>
            {hasName && (
              <InlineField label={t('builtins.orvilo-task.edit.rename')}>{params.name}</InlineField>
            )}
            {hasPriority && (
              <InlineField label={t('builtins.orvilo-task.edit.priority')}>
                <TaskPriorityTag disableDropdown priority={params.priority!} size={16} />
              </InlineField>
            )}
            {hasAssignee && (
              <InlineField label={t('builtins.orvilo-task.edit.assign')}>
                {params.assigneeAgentId || params.assigneeUserId ? (
                  <>
                    {params.assigneeAgentId && <AssigneeInline agentId={params.assigneeAgentId} />}
                    {params.assigneeUserId && (
                      <MemberAssigneeInline userId={params.assigneeUserId} />
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    {t('builtins.orvilo-task.edit.unassign')}
                  </div>
                )}
              </InlineField>
            )}
            {hasParent && (
              <InlineField label={t('builtins.orvilo-task.edit.parent')}>
                {params.parentIdentifier === null ? (
                  <div className="text-muted-foreground">
                    {t('builtins.orvilo-task.edit.parentClear')}
                  </div>
                ) : (
                  <span className={monoChipClassName}>{params.parentIdentifier}</span>
                )}
              </InlineField>
            )}
            {hasInstruction && (
              <SectionField label={t('builtins.orvilo-task.field.instruction')}>
                <Markdown fontSize={12} variant={'chat'}>
                  {params.instruction!}
                </Markdown>
              </SectionField>
            )}
            {hasDescription && (
              <SectionField label={t('builtins.orvilo-task.field.description')}>
                {params.description}
              </SectionField>
            )}
            {hasAddDeps && (
              <InlineField label={t('builtins.orvilo-task.edit.blocksOn')}>
                <div className={styles.deps}>
                  {params.addDependencies!.map((dep) => (
                    <span className={styles.addChip} key={`add-${dep}`}>
                      {dep}
                    </span>
                  ))}
                </div>
              </InlineField>
            )}
            {hasRemoveDeps && (
              <InlineField label={t('builtins.orvilo-task.edit.unblocks')}>
                <div className={styles.deps}>
                  {params.removeDependencies!.map((dep) => (
                    <span className={styles.removeChip} key={`remove-${dep}`}>
                      {dep}
                    </span>
                  ))}
                </div>
              </InlineField>
            )}
          </>
        ) : null}
      </TaskResultCard>
    );
  },
);

EditTaskRender.displayName = 'EditTaskRender';

export default EditTaskRender;
