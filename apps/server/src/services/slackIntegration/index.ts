import { randomBytes } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';

import { SlackIntegrationModel } from '@/database/models/slackIntegration';
import { hasActiveWorkspaceMembership, hasWorkspaceAdminAccess } from '@/database/models/workspace';
import { agents, slackUserConnections, workspaceSlackInstallations } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';

import {
  exchangeCode,
  getOAuthConfig,
  SLACK_BOT_SCOPES,
  slackApi,
  SlackProviderError,
} from './oauth';
import { saveState, type SlackOAuthState } from './oauthState';

export class SlackIntegrationService {
  constructor(private readonly db: OrviloDatabase) {}
  async assertMember(workspaceId: string, userId: string, admin = false) {
    const allowed = await (admin ? hasWorkspaceAdminAccess : hasActiveWorkspaceMembership)(
      this.db,
      { workspaceId, userId },
    );
    if (!allowed)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Slack workspace access denied' });
  }
  async getInstallationByTeamId(teamId: string) {
    const [row] = await this.db
      .select()
      .from(workspaceSlackInstallations)
      .where(eq(workspaceSlackInstallations.slackTeamId, teamId))
      .limit(1);
    return row ?? null;
  }
  async getBotToken(installation: typeof workspaceSlackInstallations.$inferSelect) {
    const result = await (
      await KeyVaultsGateKeeper.initWithEnvKey()
    ).decrypt(installation.botTokenCiphertext);
    if (!result.wasAuthentic || !result.plaintext)
      throw new SlackProviderError('slack_token_unavailable');
    return result.plaintext;
  }
  async resolveSlackUser(input: { installationId: string; slackUserId: string }) {
    const [row] = await this.db
      .select({
        userId: slackUserConnections.userId,
        workspaceId: workspaceSlackInstallations.workspaceId,
      })
      .from(slackUserConnections)
      .innerJoin(
        workspaceSlackInstallations,
        eq(slackUserConnections.installationId, workspaceSlackInstallations.id),
      )
      .where(
        and(
          eq(slackUserConnections.installationId, input.installationId),
          eq(slackUserConnections.slackUserId, input.slackUserId),
        ),
      )
      .limit(1);
    if (!row || !(await hasActiveWorkspaceMembership(this.db, row))) return null;
    return row;
  }
  async resolveSlackBinding(input: {
    installationId: string;
    slackChannelId: string;
    userId: string;
  }) {
    const [installation] = await this.db
      .select()
      .from(workspaceSlackInstallations)
      .where(eq(workspaceSlackInstallations.id, input.installationId))
      .limit(1);
    if (
      !installation ||
      !(await hasActiveWorkspaceMembership(this.db, {
        workspaceId: installation.workspaceId,
        userId: input.userId,
      }))
    )
      return null;
    const binding = await new SlackIntegrationModel(
      this.db,
      installation.workspaceId,
    ).bindingByChannel(input.slackChannelId);
    if (!binding) return null;
    try {
      await this.assertAgent(installation.workspaceId, input.userId, binding.agentId);
    } catch (error) {
      if (error instanceof TRPCError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND'))
        return null;
      throw error;
    }
    return {
      agentId: binding.agentId,
      bindingId: binding.id,
      workspaceId: installation.workspaceId,
    };
  }
  async assertAgent(workspaceId: string, userId: string, agentId: string) {
    const [agent] = await this.db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)),
      )
      .limit(1);
    if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
    await assertCanUseWorkspaceAgent({ db: this.db, workspaceId, userId, agentId });
  }
  async availableAgents(workspaceId: string, userId: string) {
    const rows = await this.db
      .select({ id: agents.id, name: agents.name, title: agents.title })
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)));
    const checks = await Promise.all(
      rows.map(async (row) => {
        try {
          await this.assertAgent(workspaceId, userId, row.id);
          return { id: row.id, name: row.name || row.title || row.id };
        } catch (error) {
          if (
            error instanceof TRPCError &&
            (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')
          )
            return null;
          throw error;
        }
      }),
    );
    return checks.filter((row): row is { id: string; name: string } => !!row);
  }
  async startOAuth(input: {
    workspaceId: string;
    userId: string;
    mode: 'workspace' | 'personal';
    attempt: string;
  }) {
    await this.assertMember(input.workspaceId, input.userId, input.mode === 'workspace');
    const config = getOAuthConfig();
    const installation = await new SlackIntegrationModel(this.db, input.workspaceId).installation();
    if (input.mode === 'personal' && !installation)
      throw new SlackProviderError('slack_installation_required');
    const state = randomBytes(32).toString('base64url');
    await saveState(state, {
      ...input,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      installationId: installation?.id,
      tokenRevision: installation?.tokenRevision,
      teamId: installation?.slackTeamId,
    });
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('user_scope', 'users:read');
    if (input.mode === 'workspace') url.searchParams.set('scope', SLACK_BOT_SCOPES.join(','));
    if (installation) url.searchParams.set('team', installation.slackTeamId);
    return url.toString();
  }
  async completeOAuth(payload: SlackOAuthState, code: string) {
    await this.assertMember(payload.workspaceId, payload.userId, payload.mode === 'workspace');
    const config = getOAuthConfig();
    if (payload.clientId !== config.clientId || payload.redirectUri !== config.redirectUri)
      throw new SlackProviderError('slack_configuration_changed');
    const grant = await exchangeCode(code, payload.redirectUri);
    if (payload.teamId && payload.teamId !== grant.team.id)
      throw new SlackProviderError('slack_team_mismatch');
    const model = new SlackIntegrationModel(this.db, payload.workspaceId);
    const current = await model.installation();
    if (
      current?.id !== payload.installationId ||
      current?.tokenRevision !== payload.tokenRevision ||
      (current && current.slackTeamId !== grant.team.id)
    )
      throw new SlackProviderError('slack_installation_changed');
    if (!grant.authed_user.access_token) throw new SlackProviderError('slack_user_token_required');
    const identity = await slackApi('auth.test', grant.authed_user.access_token);
    if (identity.team_id !== grant.team.id || identity.user_id !== grant.authed_user.id)
      throw new SlackProviderError('slack_user_mismatch');
    const member = await slackApi('users.info', grant.authed_user.access_token, {
      user: grant.authed_user.id,
    });
    if (
      !member.user ||
      member.user.id !== grant.authed_user.id ||
      member.user.deleted ||
      member.user.is_bot ||
      member.user.team_id !== grant.team.id
    )
      throw new SlackProviderError('slack_membership_invalid');
    await this.assertMember(payload.workspaceId, payload.userId, payload.mode === 'workspace');
    let installInput: Parameters<SlackIntegrationModel['upsertInstallation']>[0] | undefined;
    if (payload.mode === 'workspace') {
      if (grant.expires_in || grant.refresh_token)
        throw new SlackProviderError('slack_token_rotation_unsupported');
      if (
        grant.token_type !== 'bot' ||
        !grant.access_token ||
        !grant.bot_user_id ||
        !SLACK_BOT_SCOPES.every((scope) => grant.scope?.split(',').includes(scope))
      )
        throw new SlackProviderError('slack_scopes_missing');
      const botIdentity = await slackApi('auth.test', grant.access_token);
      if (botIdentity.team_id !== grant.team.id || botIdentity.user_id !== grant.bot_user_id)
        throw new SlackProviderError('slack_bot_mismatch');
      installInput = {
        slackTeamId: grant.team.id,
        teamName: grant.team.name,
        botUserId: grant.bot_user_id,
        botTokenCiphertext: await (
          await KeyVaultsGateKeeper.initWithEnvKey()
        ).encrypt(grant.access_token),
        installedByUserId: payload.userId,
        scopes: grant.scope!.split(','),
      };
    }
    await this.db.transaction(async (tx) => {
      const writeModel = new SlackIntegrationModel(tx, payload.workspaceId);
      const expected =
        payload.installationId && payload.tokenRevision
          ? { id: payload.installationId, tokenRevision: payload.tokenRevision }
          : null;
      const locked = await writeModel.lockInstallation(expected);
      const installation = installInput
        ? await writeModel.upsertInstallation(installInput, expected)
        : locked;
      if (!installation) throw new SlackProviderError('slack_installation_required');
      await writeModel.connectUser(
        installation.id,
        payload.userId,
        grant.authed_user.id,
        member.user.profile?.display_name || member.user.real_name,
      );
    });
  }

  async channels(workspaceId: string, cursor?: string) {
    const installation = await new SlackIntegrationModel(this.db, workspaceId).installation();
    if (!installation) throw new SlackProviderError('slack_installation_required');
    const result = await slackApi('conversations.list', await this.getBotToken(installation), {
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '100',
      ...(cursor ? { cursor } : {}),
    });
    return {
      channels: result.channels.map(
        (channel: { id: string; name: string; is_private: boolean }) => ({
          id: channel.id,
          name: channel.name,
          isPrivate: channel.is_private,
        }),
      ),
      nextCursor: result.response_metadata?.next_cursor || undefined,
    };
  }
  async saveBinding(input: {
    workspaceId: string;
    userId: string;
    slackChannelId: string;
    agentId: string;
  }) {
    await this.assertAgent(input.workspaceId, input.userId, input.agentId);
    const model = new SlackIntegrationModel(this.db, input.workspaceId);
    const installation = await model.installation();
    if (!installation) throw new SlackProviderError('slack_installation_required');
    const result = await slackApi('conversations.info', await this.getBotToken(installation), {
      channel: input.slackChannelId,
    });
    if (
      result.channel?.id !== input.slackChannelId ||
      result.channel.is_archived ||
      result.channel.is_im ||
      result.channel.is_mpim
    )
      throw new SlackProviderError('slack_channel_invalid');
    return model.saveBinding(
      {
        slackChannelId: input.slackChannelId,
        slackChannelName: result.channel.name,
        agentId: input.agentId,
      },
      { id: installation.id, tokenRevision: installation.tokenRevision },
    );
  }
}
export const createSlackIntegrationService = (db: OrviloDatabase) =>
  new SlackIntegrationService(db);
