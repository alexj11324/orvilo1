'use client';

import { Markdown } from '@lobehub/ui';
import { DEFAULT_AVATAR } from '@orvilo/const';
import type { AgentGroupMember, BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, useTheme } from 'antd-style';
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

const styles = createStaticStyles(({ css, cssVar }) => ({
  assignee: css`
    display: flex;
    flex-shrink: 0;
    gap: 6px;
    align-items: center;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  container: css`
    .accordion-action {
      margin-inline-end: 8px;
      opacity: 1 !important;
    }
  `,
  index: css`
    flex-shrink: 0;
    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
  `,
  instruction: css`
    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};
  `,
  resultBox: css`
    overflow: hidden;
  `,
  resultLabel: css`
    padding-inline: 4px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,

  taskTitle: css`
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

/**
 * ExecuteTasks Render component for Group Management tool
 * Accordion-style task list with expandable instruction and assignee on the right
 */
const ExecuteTasksRender = memo<BuiltinRenderProps<ExecuteTasksParams, unknown, string>>(
  ({ args, content }) => {
    const { t } = useTranslation('tool');
    const theme = useTheme();
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
      <div className={cn('flex', 'flex-col', 'gap-3', styles.container)}>
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
                      background={task.agent?.backgroundColor || theme.colorBgContainer}
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
                        background: cssVar.colorFillTertiary,
                        borderRadius: cssVar.borderRadius,
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
              style={{ background: cssVar.colorFillTertiary, borderRadius: cssVar.borderRadius }}
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
