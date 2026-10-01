import { TASK_WATCHDOG_INTERVAL_MS } from '@/server/services/taskWatchdogSchedule';

export const MCP_EVENT_RENEWAL_BATCH_SIZE = 20;
export const MCP_EVENT_RENEWAL_CONCURRENCY = 4;
// Five waves of four 30-second requests, plus a 30-second scheduling margin.
export const MCP_EVENT_RENEWAL_LEAD_MS = TASK_WATCHDOG_INTERVAL_MS + 3 * 60_000;
