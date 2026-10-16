'use client';

import { useParams } from 'react-router';

import { GoalDetailPage } from '@/features/AgentGoals';

/**
 * Goal detail without an agent in the path, mirroring the bare `/task/:taskId`
 * route. A goal created from a project page has no responsible agent, so this
 * is the only way to open one.
 */
const GoalDetailRoute = () => {
  const { goalId: orchestrationWorkflowId } = useParams<{ goalId?: string }>();

  if (!orchestrationWorkflowId) return null;

  return <GoalDetailPage orchestrationWorkflowId={orchestrationWorkflowId} />;
};

export default GoalDetailRoute;
