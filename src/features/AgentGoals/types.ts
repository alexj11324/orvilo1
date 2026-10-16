import type { OrchestrationWorkflowListItem } from '@/store/goal/initialState';

export interface GoalItemProps {
  orchestrationWorkflow: OrchestrationWorkflowListItem;
  projectId?: string;
}
