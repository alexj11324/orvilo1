import type { DeviceCapabilitySnapshot, WorkingDirEntry } from '@orvilo/types';
import { and, desc, eq, exists, isNull, or, sql } from 'drizzle-orm';

import type { DeviceItem } from '../schemas';
import { agents, devices, resourcePermissions, workspaceMembers } from '../schemas';
import type { OrviloDatabase } from '../type';

export interface RegisterDeviceParams {
  adapterVersion?: string | null;
  deviceId: string;
  hostname?: string | null;
  identitySource: string;
  platform?: string | null;
}
export interface UpdateDeviceParams {
  defaultCwd?: string | null;
  friendlyName?: string | null;
  workingDirs?: WorkingDirEntry[];
}

/** A device belongs to its enrolling user. Agent access grants execution on its saved host. */
export class DeviceModel {
  constructor(
    private db: OrviloDatabase,
    private userId: string,
    private workspaceId?: string,
  ) {}

  private owned = () => eq(devices.userId, this.userId);

  private accessibleAgent = () =>
    or(
      eq(agents.userId, this.userId),
      and(
        eq(agents.visibility, 'public'),
        exists(
          this.db
            .select({ resourceId: resourcePermissions.resourceId })
            .from(resourcePermissions)
            .where(
              and(
                eq(resourcePermissions.workspaceId, this.workspaceId!),
                eq(resourcePermissions.resourceType, 'agent'),
                eq(resourcePermissions.resourceId, agents.id),
                eq(resourcePermissions.userId, this.userId),
                eq(resourcePermissions.accessLevel, 'use'),
              ),
            ),
        ),
      ),
    );

  /** Internal execution lookup; callers must authorize Agent Use before dispatch. */
  private executionAuthority = () => {
    if (!this.workspaceId) return this.owned();
    const boundAgent = this.db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, this.workspaceId),
          this.accessibleAgent(),
          sql`${agents.agencyConfig}->>'boundDeviceId' = ${devices.deviceId}`,
        ),
      );
    const activeOwner = this.db
      .select({ id: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, this.workspaceId),
          eq(workspaceMembers.userId, devices.userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaceMembers.suspendedAt),
        ),
      );
    const activeCaller = this.db
      .select({ id: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, this.workspaceId),
          eq(workspaceMembers.userId, this.userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaceMembers.suspendedAt),
        ),
      );
    return or(this.owned(), and(exists(boundAgent), exists(activeOwner), exists(activeCaller)));
  };

  getBoundAgentIds = async (deviceId: string): Promise<string[]> => {
    if (!this.workspaceId) return [];
    const rows = await this.db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, this.workspaceId),
          this.accessibleAgent(),
          sql`${agents.agencyConfig}->>'boundDeviceId' = ${deviceId}`,
        ),
      );
    return rows.map((row) => row.id);
  };

  register = async (params: RegisterDeviceParams) => {
    const now = new Date();
    const [result] = await this.db
      .insert(devices)
      .values({ ...params, userId: this.userId, lastSeenAt: now, lastVerifiedAt: now })
      .onConflictDoUpdate({
        target: [devices.userId, devices.deviceId],
        set: { ...params, lastSeenAt: now, lastVerifiedAt: now },
      })
      .returning();
    return result;
  };
  query = async (): Promise<DeviceItem[]> =>
    this.db.select().from(devices).where(this.owned()).orderBy(desc(devices.lastSeenAt));
  queryForExecution = async (): Promise<DeviceItem[]> =>
    this.db
      .select()
      .from(devices)
      .where(this.executionAuthority())
      .orderBy(desc(devices.lastSeenAt));
  findByDeviceId = async (deviceId: string) => {
    const [device] = await this.db
      .select()
      .from(devices)
      .where(and(this.owned(), eq(devices.deviceId, deviceId)))
      .limit(1);
    return device;
  };
  findExecutionDeviceById = async (deviceId: string) => {
    const [device] = await this.db
      .select()
      .from(devices)
      .where(and(this.executionAuthority(), eq(devices.deviceId, deviceId)))
      .limit(1);
    return device;
  };
  /** Configuration discovery only, after the caller's Agent Manage or Use check. */
  findSavedAgentDeviceById = async (agentId: string, deviceId: string) => {
    if (!this.workspaceId) return this.findByDeviceId(deviceId);
    const [row] = await this.db
      .select({ device: devices })
      .from(devices)
      .innerJoin(agents, sql`${agents.agencyConfig}->>'boundDeviceId' = ${devices.deviceId}`)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, this.workspaceId),
          eq(workspaceMembers.userId, devices.userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaceMembers.suspendedAt),
        ),
      )
      .where(
        and(
          eq(devices.deviceId, deviceId),
          eq(agents.id, agentId),
          eq(agents.workspaceId, this.workspaceId),
          or(eq(agents.visibility, 'public'), eq(agents.userId, this.userId)),
        ),
      )
      .limit(1);
    return row?.device;
  };
  update = async (deviceId: string, value: UpdateDeviceParams) =>
    this.db
      .update(devices)
      .set({ ...value, updatedAt: new Date() })
      .where(and(this.owned(), eq(devices.deviceId, deviceId)));
  delete = async (deviceId: string) =>
    this.db.delete(devices).where(and(this.owned(), eq(devices.deviceId, deviceId)));
  updateCapabilityEvidence = async (
    deviceId: string,
    snapshot: Pick<DeviceCapabilitySnapshot, 'supportedTools'>,
  ) => {
    await this.db
      .update(devices)
      .set({
        capabilitySnapshot: sql`coalesce(${devices.capabilitySnapshot}, '{}'::jsonb) || ${JSON.stringify(snapshot)}::jsonb`,
        lastVerifiedAt: new Date(),
      })
      .where(and(this.owned(), eq(devices.deviceId, deviceId)));
  };
  updateRuntimeInstallationEvidence = async (
    deviceId: string,
    installedRuntimes: NonNullable<DeviceCapabilitySnapshot['installedRuntimes']>,
  ) => {
    await this.db
      .update(devices)
      .set({
        capabilitySnapshot: sql`coalesce(${devices.capabilitySnapshot}, '{}'::jsonb) || jsonb_build_object('installedRuntimes', coalesce(${devices.capabilitySnapshot}->'installedRuntimes', '{}'::jsonb) || ${JSON.stringify(installedRuntimes)}::jsonb)`,
      })
      .where(and(this.owned(), eq(devices.deviceId, deviceId)));
  };
}
