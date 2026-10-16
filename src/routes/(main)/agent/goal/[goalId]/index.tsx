'use client';

import { memo } from 'react';
import { useParams } from 'react-router';

import { GoalDetailPage } from '@/features/AgentGoals';

const GoalDetailRoute = memo(() => {
  const { aid, goalId: orchestrationWorkflowId } = useParams<{ aid?: string; goalId?: string }>();

  if (!aid || !orchestrationWorkflowId) return null;

  return <GoalDetailPage agentId={aid} orchestrationWorkflowId={orchestrationWorkflowId} />;
});

export default GoalDetailRoute;
