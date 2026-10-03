import { redisEnv } from '@/envs/redis';
import { getAgentRuntimeRedisClient } from '@/server/modules/AgentExecution/redis';

const HEALTH_TTL_SECONDS = 180;
const healthKey = () => `${redisEnv.REDIS_PREFIX}:mcp-events:worker-health`;

export interface McpEventWorkerHealth {
  observedAt?: number;
  status: 'ready' | 'unavailable' | 'unknown';
}

/** Shared observation across HTTP and worker processes; expires when workers stop. */
export async function recordMcpEventWorkerHealth(status: 'ready' | 'unavailable') {
  try {
    await getAgentRuntimeRedisClient()?.set(
      healthKey(),
      JSON.stringify({ observedAt: Date.now(), status }),
      'EX',
      HEALTH_TTL_SECONDS,
    );
  } catch {
    // Observation storage must not change the durable inbox execution outcome.
  }
}

export async function getMcpEventWorkerHealth(): Promise<McpEventWorkerHealth> {
  try {
    const value = await getAgentRuntimeRedisClient()?.get(healthKey());
    if (!value) return { status: 'unknown' };
    const health = JSON.parse(value) as McpEventWorkerHealth;
    if (
      (health.status !== 'ready' && health.status !== 'unavailable') ||
      typeof health.observedAt !== 'number' ||
      !Number.isSafeInteger(health.observedAt) ||
      health.observedAt > Date.now() ||
      Date.now() - health.observedAt >= HEALTH_TTL_SECONDS * 1000
    )
      return { status: 'unknown' };
    return health;
  } catch {
    return { status: 'unavailable' };
  }
}
