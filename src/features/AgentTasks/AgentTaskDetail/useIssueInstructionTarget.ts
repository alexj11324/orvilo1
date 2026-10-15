import { useTaskStore } from '@/store/task';

export const useIssueInstructionTarget = (taskId?: string) => {
  const useFetch = useTaskStore((s) => s.useFetchIssueInstructionTarget);
  const response = useFetch(taskId);
  return { ...response, target: response.data?.data };
};
