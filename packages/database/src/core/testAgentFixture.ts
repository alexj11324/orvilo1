import { createHash } from 'node:crypto';

import { and, eq, isNull, SQL, sql } from 'drizzle-orm';

import type { NewAgent } from '../schemas';
import { devices } from '../schemas';
import type { OrviloDatabase } from '../type';

type TestAgentInput = Omit<Partial<NewAgent>, 'agencyConfig'> & {
  agencyConfig?: NewAgent['agencyConfig'] | SQL;
};

export async function withTestAgentDevices<T extends TestAgentInput>(
  db: OrviloDatabase,
  input: T,
): Promise<T>;
export async function withTestAgentDevices<T extends TestAgentInput>(
  db: OrviloDatabase,
  input: T[],
): Promise<T[]>;
/** Real registered-device fixtures for tests whose subject is not device admission. */
export async function withTestAgentDevices<T extends TestAgentInput>(
  db: OrviloDatabase,
  input: T | T[],
): Promise<T | T[]> {
  const bind = async (agent: T): Promise<T> => {
    if (!agent.userId) throw new Error('Agent fixture requires its real owning user');
    const storedAgency = agent.agencyConfig ?? {};
    const agency = storedAgency instanceof SQL ? {} : storedAgency;
    const deviceId =
      agency.boundDeviceId ||
      createHash('sha256')
        .update(`agent-fixture:${agent.userId}:${agent.workspaceId ?? 'personal'}`)
        .digest('hex')
        .slice(0, 32);
    const where = and(
      eq(devices.deviceId, deviceId),
      agent.workspaceId
        ? eq(devices.workspaceId, agent.workspaceId)
        : and(eq(devices.userId, agent.userId), isNull(devices.workspaceId)),
    );
    if (!(await db.select({ id: devices.id }).from(devices).where(where).limit(1)).length) {
      await db
        .insert(devices)
        .values({
          deviceId,
          identitySource: 'installation',
          userId: agent.userId,
          visibility: agent.workspaceId ? 'public' : 'private',
          workspaceId: agent.workspaceId,
        })
        .onConflictDoNothing();
    }
    if (storedAgency instanceof SQL)
      return {
        ...agent,
        agencyConfig: sql`${storedAgency} || ${JSON.stringify({ boundDeviceId: deviceId, executionTarget: 'device' })}::jsonb`,
      };
    return {
      ...agent,
      agencyConfig: {
        executionTarget: 'device',
        ...agency,
        boundDeviceId: deviceId,
      },
    };
  };
  return Array.isArray(input) ? Promise.all(input.map(bind)) : bind(input);
}
