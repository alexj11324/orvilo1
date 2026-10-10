'use client';

import { Markdown } from '@lobehub/ui';
import { DEFAULT_AVATAR } from '@orvilo/const';
import type { AgentGroupMember, BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import type { ExecuteTasksParams } from '../../../types';

const styles = {
  assignee: 'flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground',
  index: 'shrink-0 text-[12px] text-[var(--ant-color-text-quaternary)]',
  instruction: 'text-[13px] leading-[1.6] text-muted-foreground',
  resultBox: 'overflow-hidden',
  resultLabel: 'px-1 text-[12px] text-[var(--ant-color-text-tertiary)]',
  taskTitle: 'truncate text-[14px]',
};

/**
 * ExecuteTasks Render component for Group Management tool
 * Accordion-style task list with expandable instruction and assignee on the right
 */
const ExecuteTasksRender = memo<BuiltinRenderProps<ExecuteTasksParams, unknown, string>>(
  ({ args, content }) => {
    const { t } = useTranslation('tool');

    const { tasks } = args || {};
    const resultContent = typeof content === 'string' ? content.trim() : '';

    // Get active group ID and agents from store
    const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
    const groupAgents = useAgentGroupStore((s) =>
      activeGroupId ? agentGroupSelectors.getGroupAgents(activeGroupId)(s) : [],
    );

    // Get agent details for each task
    const tasksWithAgents = useMemo(() => {
      if (!tasks?.length) return [];
      return tasks.map((task) => ({
        ...task,
        agent: groupAgents.find((agent) => agent.id === task.agentId) as
          AgentGroupMember | undefined,
      }));
    }, [tasks, groupAgents]);

    if (!tasksWithAgents.length && !resultContent) return null;

    return (
      <div className={cn('flex', 'flex-col', 'gap-3')}>
        {!!tasksWithAgents.length && (
          <Accordion>
            {tasksWithAgents.map((task, index) => (
              <AccordionItem key={task.agentId || index} value={task.agentId || String(index)}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                    <span className={styles.index}>{index + 1}.</span>
                    <div className={cn('font-medium', styles.taskTitle)}>
                      {task.title || 'Task'}
                    </div>
                  </div>
                  <div className={styles.assignee}>
                    <Avatar
                      avatar={task.agent?.avatar || DEFAULT_AVATAR}
                      background={task.agent?.backgroundColor || 'var(--card)'}
                      shape={'circle'}
                      size={20}
                    />
                    <span>{task.agent?.title}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {task.instruction && (
                    <div
                      className="p-3"
                      style={{
                        marginTop: 8,
                        background: 'var(--accent)',
                        borderRadius: 'var(--ant-border-radius)',
                      }}
                    >
                      <div className={cn(styles.instruction)}>{task.instruction}</div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {resultContent && (
          <div className="flex flex-col gap-1">
            <div className={cn(styles.resultLabel)}>
              {t('agentGroupManagement.executeTasks.results')}
            </div>
            <div
              className={cn('p-3', styles.resultBox)}
              style={{ background: 'var(--accent)', borderRadius: 'var(--ant-border-radius)' }}
            >
              <Markdown style={{ maxHeight: 320, overflow: 'auto' }} variant={'chat'}>
                {resultContent}
              </Markdown>
            </div>
          </div>
        )}
      </div>
    );
  },
);

ExecuteTasksRender.displayName = 'ExecuteTasksRender';

export default ExecuteTasksRender;
