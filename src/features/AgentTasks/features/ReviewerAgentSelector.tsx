'use client';

import { agentDisplayName } from '@orvilo/types';
import { t } from 'i18next';
import type { ComponentProps } from 'react';

import { createModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';

import AssigneeAgentSelector from './AssigneeAgentSelector';

type Props = Omit<ComponentProps<typeof AssigneeAgentSelector>, 'onHandoff'>;

/** The full usable-Agent catalog includes the executor, with unsupported runtimes disabled. */
export const ReviewerAgentSelector = ({ taskIdentifier, onChange, ...props }: Props) => {
  const updateTask = useTaskStore((s) => s.updateTask);
  const { allowed: canEditTask } = usePermission('create_content');
  const { data, error, isLoading, mutate } = useClientDataSWR(
    canEditTask ? ['task/reviewer-agents'] : null,
    () => taskService.listReviewerAgents(),
  );
  const agents = data?.data.map((agent) => ({
    avatar: null,
    description: null,
    id: agent.id,
    name: agent.name,
    pinned: false,
    title: agent.name,
    type: 'agent' as const,
    updatedAt: new Date(),
  }));
  const agentDisabledReasons = Object.fromEntries(
    (data?.data ?? [])
      .filter((agent) => !agent.canReviewIssues)
      .map((agent) => [agent.id, t('taskDetail.reviewerPicker.unsupported', { ns: 'chat' })]),
  );
  return (
    <AssigneeAgentSelector
      {...props}
      agentDisabledReasons={agentDisabledReasons}
      catalogAgents={agents}
      catalogError={error}
      catalogLoading={isLoading || !data}
      label={t('taskDetail.reviewer', { ns: 'chat' })}
      taskIdentifier={taskIdentifier}
      onCatalogRetry={() => void mutate()}
      onChange={
        onChange ??
        ((reviewerAgentId, agent) => {
          if (taskIdentifier)
            void updateTask(
              taskIdentifier,
              { reviewerAgentId },
              {
                optimisticReviewer: agent
                  ? {
                      avatar: typeof agent.avatar === 'string' ? agent.avatar : null,
                      id: agent.id,
                      name: agentDisplayName(agent),
                      type: 'agent',
                    }
                  : undefined,
              },
            ).catch(() => {});
        })
      }
    />
  );
};

export const pickReviewerAgent = (): Promise<string | null> =>
  new Promise((resolve) => {
    const modal = createModal({
      content: (
        <ReviewerAgentSelector
          defaultOpen
          onChange={(agentId) => {
            if (!agentId) return;
            resolve(agentId);
            modal.close();
          }}
        >
          <Button variant="outline">{t('taskDetail.property.addReviewer', { ns: 'chat' })}</Button>
        </ReviewerAgentSelector>
      ),
      footer: null,
      title: t('taskDetail.reviewerRequired', { ns: 'chat' }),
      onOpenChangeComplete: (open) => {
        if (!open) resolve(null);
      },
    });
  });
