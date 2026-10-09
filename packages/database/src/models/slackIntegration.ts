import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import {
  agents,
  slackChannelBindings,
  slackUserConnections,
  workspaces,
  workspaceSlackInstallations,
} from '../schemas';
import type { NewSlackInstallation } from '../schemas/slackIntegration';
import type { OrviloDatabase, Transaction } from '../type';

export type SlackInstallationVersion = { id: string; tokenRevision: string };

export class SlackIntegrationModel {
  constructor(
    private readonly db: OrviloDatabase | Transaction,
    private readonly workspaceId: string,
  ) {}

  private installationIds = () =>
    this.db
      .select({ id: workspaceSlackInstallations.id })
      .from(workspaceSlackInstallations)
      .where(eq(workspaceSlackInstallations.workspaceId, this.workspaceId));

  installation = async () => {
    const [row] = await this.db
      .select()
      .from(workspaceSlackInstallations)
      .where(eq(workspaceSlackInstallations.workspaceId, this.workspaceId))
      .limit(1);
    return row;
  };

  /** Call on a model backed by the caller's transaction. Locks absence as well as presence. */
  lockInstallation = async (expected: SlackInstallationVersion | null) => {
    const [workspace] = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, this.workspaceId))
      .for('update');
    if (!workspace) throw new Error('Workspace not found');
    const current = await this.installation();
    if (
      expected
        ? !current || current.id !== expected.id || current.tokenRevision !== expected.tokenRevision
        : !!current
    )
      throw new Error('Slack installation changed');
    return current;
  };

  upsertInstallation = async (
    input: Pick<
      NewSlackInstallation,
      | 'installedByUserId'
      | 'slackTeamId'
      | 'teamName'
      | 'botUserId'
      | 'botTokenCiphertext'
      | 'scopes'
    > & { tokenRevision?: string },
    expected: SlackInstallationVersion | null,
  ) => {
    const current = await this.installation();
    if (current && current.slackTeamId !== input.slackTeamId)
      throw new Error('Disconnect Slack before changing teams');
    const values = {
      ...input,
      tokenRevision: input.tokenRevision ?? randomUUID(),
      workspaceId: this.workspaceId,
    };
    const [row] = expected
      ? await this.db
          .update(workspaceSlackInstallations)
          .set({ ...values, updatedAt: new Date() })
          .where(
            and(
              eq(workspaceSlackInstallations.workspaceId, this.workspaceId),
              eq(workspaceSlackInstallations.id, expected.id),
              eq(workspaceSlackInstallations.tokenRevision, expected.tokenRevision),
              eq(workspaceSlackInstallations.slackTeamId, input.slackTeamId),
            ),
          )
          .returning()
      : await this.db
          .insert(workspaceSlackInstallations)
          .values(values)
          .onConflictDoNothing()
          .returning();
    if (!row) throw new Error('Slack installation changed');
    return row;
  };

  connection = async (userId: string) => {
    const [row] = await this.db
      .select()
      .from(slackUserConnections)
      .where(
        and(
          eq(slackUserConnections.userId, userId),
          inArray(slackUserConnections.installationId, this.installationIds()),
        ),
      )
      .limit(1);
    return row;
  };

  connectUser = async (
    installationId: string,
    userId: string,
    slackUserId: string,
    displayName?: string,
  ) => {
    const installation = await this.installation();
    if (!installation || installation.id !== installationId)
      throw new Error('Slack installation not found in workspace');
    const values = { displayName: displayName ?? null, installationId, slackUserId, userId };
    const [row] = await this.db
      .insert(slackUserConnections)
      .values(values)
      .onConflictDoUpdate({
        target: [slackUserConnections.installationId, slackUserConnections.userId],
        set: { displayName: values.displayName, slackUserId, updatedAt: new Date() },
      })
      .returning();
    return row;
  };

  disconnectPersonal = async (userId: string) =>
    this.db
      .delete(slackUserConnections)
      .where(
        and(
          eq(slackUserConnections.userId, userId),
          inArray(slackUserConnections.installationId, this.installationIds()),
        ),
      )
      .returning();

  bindings = async () =>
    this.db
      .select({
        id: slackChannelBindings.id,
        slackChannelId: slackChannelBindings.slackChannelId,
        slackChannelName: slackChannelBindings.slackChannelName,
        agentId: slackChannelBindings.agentId,
        agentName: agents.title,
      })
      .from(slackChannelBindings)
      .innerJoin(agents, eq(slackChannelBindings.agentId, agents.id))
      .where(inArray(slackChannelBindings.installationId, this.installationIds()));

  bindingByChannel = async (slackChannelId: string) => {
    const [row] = await this.db
      .select()
      .from(slackChannelBindings)
      .where(
        and(
          eq(slackChannelBindings.slackChannelId, slackChannelId),
          inArray(slackChannelBindings.installationId, this.installationIds()),
        ),
      )
      .limit(1);
    return row;
  };

  saveBinding = async (
    input: {
      agentId: string;
      slackChannelId: string;
      slackChannelName: string;
    },
    expected: SlackInstallationVersion,
  ) =>
    this.db.transaction(async (tx) => {
      const model = new SlackIntegrationModel(tx, this.workspaceId);
      const installation = await model.lockInstallation(expected);
      if (!installation) throw new Error('Slack installation not found in workspace');
      const [agent] = await tx
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.workspaceId, this.workspaceId)))
        .limit(1);
      if (!agent) throw new Error('Agent not found in workspace');
      const [row] = await tx
        .insert(slackChannelBindings)
        .values({ ...input, installationId: installation.id })
        .onConflictDoUpdate({
          target: [slackChannelBindings.installationId, slackChannelBindings.slackChannelId],
          set: { ...input, updatedAt: new Date() },
        })
        .returning();
      return row;
    });

  deleteBinding = async (id: string) =>
    this.db
      .delete(slackChannelBindings)
      .where(
        and(
          eq(slackChannelBindings.id, id),
          inArray(slackChannelBindings.installationId, this.installationIds()),
        ),
      )
      .returning();

  disconnect = async () =>
    this.db.transaction(async (tx) => {
      await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, this.workspaceId))
        .for('update');
      return tx
        .delete(workspaceSlackInstallations)
        .where(eq(workspaceSlackInstallations.workspaceId, this.workspaceId))
        .returning();
    });
}
