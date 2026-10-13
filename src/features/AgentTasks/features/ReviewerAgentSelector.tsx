'use client';

import { agentDisplayName } from '@orvilo/types';
import { t } from 'i18next';
import type { ComponentProps } from 'react';

import { createModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { useTaskStore } from '@/store/task';

import AssigneeAgentSelector from './AssigneeAgentSelector';

type Props = Omit<ComponentProps<typeof AssigneeAgentSelector>, 'onHandoff'>;

/** The reviewer uses the ordinary usable-Agent catalog, including the executor. */
export const ReviewerAgentSelector = ({ taskIdentifier, onChange, ...props }: Props) => {
  const updateTask = useTaskStore((s) => s.updateTask);
  return (
    <AssigneeAgentSelector
      {...props}
      label={t('taskDetail.reviewer', { ns: 'chat' })}
      taskIdentifier={taskIdentifier}
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
