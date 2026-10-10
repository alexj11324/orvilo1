'use client';

import { DEFAULT_AVATAR } from '@orvilo/const';
import type { BuiltinInterventionProps } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { Clock, Trash2 } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import InputNumber from '@/components/InputNumber';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import type { ExecuteTasksParams, TaskItem } from '../../types';

const styles = {
  assignee: 'flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground',
  container: 'rounded-[var(--ant-border-radius)] py-3',
  deleteButton:
    'cursor-pointer text-[var(--ant-color-text-tertiary)] transition-[color] duration-200 ease-[ease] hover:text-destructive',
  timeoutInput: 'w-[100px]',
};

const DEFAULT_TIMEOUT = 1_800_000; // 30 minutes

interface TaskEditorProps {
  index: number;
  onChange: (index: number, updates: Partial<TaskItem>) => void;
  onDelete: (index: number) => void;
  task: TaskItem;
}

const TaskEditor = memo<TaskEditorProps>(({ task, index, onChange, onDelete }) => {
  const { t } = useTranslation('tool');

  // Get agent info from store
  const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
  const agent = useAgentGroupStore((s) =>
    task.agentId && activeGroupId
      ? agentGroupSelectors.getAgentByIdFromGroup(activeGroupId, task.agentId)(s)
      : undefined,
  );

  const handleTitleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(index, { title: e.target.value });
    },
    [index, onChange],
  );

  const handleInstructionChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(index, { instruction: e.target.value });
    },
    [index, onChange],
  );

  const handleTimeoutChange = useCallback(
    (value: number | null) => {
      if (value !== null) {
        onChange(index, { timeout: value * 60 * 1000 });
      }
    },
    [index, onChange],
  );

  const handleDelete = useCallback(() => {
    onDelete(index);
  }, [index, onDelete]);

  return (
    <AccordionItem value={String(index)}>
      <AccordionTrigger>
        <div className="flex items-center gap-2">
          <div className={styles.assignee}>
            <Avatar
              avatar={agent?.avatar || DEFAULT_AVATAR}
              background={agent?.backgroundColor || 'var(--card)'}
              shape={'circle'}
              size={20}
            />
            <span>{agent?.title}</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="flex flex-col gap-3" style={{ marginTop: 8 }}>
          <div className="flex gap-3">
            <Input
              placeholder={t('agentGroupManagement.executeTasks.intervention.titlePlaceholder')}
              value={task.title}
              onChange={handleTitleChange}
            />
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <Clock size={14} />
                    </span>
                  }
                />
                <TooltipContent>
                  {t('agentGroupManagement.executeTask.intervention.timeout')}
                </TooltipContent>
              </Tooltip>
              <InputNumber
                className={styles.timeoutInput}
                max={120}
                min={1}
                value={Math.round((task.timeout || DEFAULT_TIMEOUT) / 60_000)}
                onChange={handleTimeoutChange}
              />
              <span className="text-muted-foreground">
                {t('agentGroupManagement.executeTask.intervention.timeoutUnit')}
              </span>
              <Trash2 className={styles.deleteButton} size={16} onClick={handleDelete} />
            </div>
          </div>
          <Textarea
            placeholder={t('agentGroupManagement.executeTasks.intervention.instructionPlaceholder')}
            value={task.instruction}
            onChange={handleInstructionChange}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
});

/**
 * ExecuteTasks Intervention Component
 *
 * Allows users to review and modify multiple tasks before execution.
 */
const ExecuteTasksIntervention = memo<BuiltinInterventionProps<ExecuteTasksParams>>(
  ({ args, onArgsChange, registerBeforeApprove }) => {
    // Local state
    const [tasks, setTasks] = useState<TaskItem[]>(args?.tasks || []);
    const [hasChanges, setHasChanges] = useState(false);

    // Sync local state when args change externally
    useEffect(() => {
      if (!hasChanges) {
        setTasks(args?.tasks || []);
      }
    }, [args?.tasks, hasChanges]);

    // Handle task change
    const handleTaskChange = useCallback((index: number, updates: Partial<TaskItem>) => {
      setTasks((prev) => {
        const newTasks = [...prev];
        newTasks[index] = { ...newTasks[index], ...updates };
        return newTasks;
      });
      setHasChanges(true);
    }, []);

    // Handle task delete
    const handleTaskDelete = useCallback((index: number) => {
      setTasks((prev) => prev.filter((_, i) => i !== index));
      setHasChanges(true);
    }, []);

    // Save changes before approval
    useEffect(() => {
      if (!registerBeforeApprove) return;

      const cleanup = registerBeforeApprove('executeTasks', async () => {
        if (hasChanges && onArgsChange) {
          await onArgsChange({ ...args, tasks });
        }
      });

      return cleanup;
    }, [registerBeforeApprove, hasChanges, tasks, args, onArgsChange]);

    return (
      <Accordion className={styles.container} defaultValue={tasks.map((_, i) => String(i))}>
        {tasks.map((task, index) => (
          <TaskEditor
            index={index}
            key={task.agentId || index}
            task={task}
            onChange={handleTaskChange}
            onDelete={handleTaskDelete}
          />
        ))}
      </Accordion>
    );
  },
  isEqual,
);

ExecuteTasksIntervention.displayName = 'ExecuteTasksIntervention';

export default ExecuteTasksIntervention;
