const ACTIVE_TASK_DETAIL_POLL_INTERVAL = 10_000;
const IDLE_TASK_DETAIL_POLL_INTERVAL = 15_000;

export const resolveTaskDetailPolling = (hasTask: boolean, shouldPollFast: boolean) => {
  if (!hasTask) return { dedupingInterval: 0, refreshInterval: 0 };
  const refreshInterval = shouldPollFast
    ? ACTIVE_TASK_DETAIL_POLL_INTERVAL
    : IDLE_TASK_DETAIL_POLL_INTERVAL;
  return { dedupingInterval: refreshInterval, refreshInterval };
};
