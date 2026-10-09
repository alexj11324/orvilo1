import { type ChannelHandler, createChannel, type StateStore } from '@copilotkit/channels-core';
import { slack } from '@copilotkit/channels-slack';
import type { OrviloDatabase } from '@orvilo/database';
import { ResponsesService } from '@orvilo/openapi/src/services/responses.service';
import { isRecord } from '@orvilo/utils/object';

import { SlackChannelsReceiver } from './receiver';

export interface SlackChannelsInstallation {
  botToken: string;
  id: string;
  teamId: string;
  tokenRevision: string;
}

export interface SlackChannelsDependencies {
  database: OrviloDatabase;
  /** Must check current workspace membership and permission to use the bound Agent. */
  resolveBinding: (input: {
    installationId: string;
    slackChannelId: string;
    userId: string;
  }) => Promise<{ agentId: string; workspaceId: string } | null>;
  /** OAuth-linked human identity; never fall back to the installer. */
  resolveUser: (input: {
    installationId: string;
    slackUserId: string;
  }) => Promise<{ id: string; name?: string } | null>;
  store: StateStore;
}

interface ConversationState {
  pending: boolean;
  responseId?: string;
}

export function slackEnvelopeTeamId(body: Record<string, unknown>) {
  return typeof body.team_id === 'string'
    ? body.team_id
    : isRecord(body.team) && typeof body.team.id === 'string'
      ? body.team.id
      : undefined;
}

export async function createSlackChannelsRuntime(
  installation: SlackChannelsInstallation,
  deps: SlackChannelsDependencies,
) {
  const receiver = new SlackChannelsReceiver();
  const adapter = slack({
    appToken: '',
    assistant: false,
    botToken: installation.botToken,
    receiver,
    respondTo: { threadReplies: 'afterBotReply' },
    socketMode: false,
    streaming: 'legacy',
  });
  const channel = createChannel({
    name: `slack-${installation.id}`,
    adapters: [adapter],
    identifyUser: async (context) => {
      if (context.tenant.id !== installation.teamId || context.actor.kind !== 'human') return null;
      const user = await deps.resolveUser({
        installationId: installation.id,
        slackUserId: context.actor.id,
      });
      return user ? { id: user.id, name: user.name || user.id } : null;
    },
    store: { adapter: deps.store, concurrency: 'serial' },
  });

  const forward: ChannelHandler = async ({ thread, message }) => {
    const slackChannelId = thread.conversationKey.split('::')[0];
    const startsRun = message.operation.mentioned || slackChannelId.startsWith('D');
    if (!message.user) {
      if (startsRun)
        await thread.post('Connect your Slack account to Orvilo before using this Agent.');
      return;
    }
    const binding = await deps.resolveBinding({
      installationId: installation.id,
      slackChannelId,
      userId: message.user.id,
    });
    if (!binding) {
      if (startsRun) await thread.post('This conversation has no Agent you are allowed to use.');
      return;
    }
    // A Slack thread can contain several humans. Their private Orvilo topics must never be shared.
    const stateKey = `response:${JSON.stringify([
      installation.id,
      thread.conversationKey,
      message.user.id,
      binding.workspaceId,
      binding.agentId,
    ])}`;
    const lock = await deps.store.lock.acquire(stateKey, { ttlMs: 360_000 });
    if (!lock) throw new Error('Slack conversation is already running');
    try {
      const previous = await deps.store.kv.get<ConversationState>(stateKey);
      if (!startsRun && !previous) return;
      const attachmentKey = `attachment:${slackChannelId}:${message.operation.logicalMessageId}`;
      if (message.contentParts?.length || (await deps.store.kv.get(attachmentKey))) {
        await thread.post('Slack attachments are not supported yet. Send a text message instead.');
        return;
      }
      if (!message.text.trim()) return;
      if (previous?.pending) {
        await thread.post(
          'Your previous Agent run is unresolved. Inspect it in Orvilo before continuing.',
        );
        return;
      }
      // Retain ambiguity across worker failures; a redelivery must not dispatch the same prompt again.
      await deps.store.kv.set(stateKey, { ...previous, pending: true });
      const service = new ResponsesService(deps.database, message.user.id, binding.workspaceId);
      let completedState: ConversationState | undefined;
      await thread.stream(
        slackResponseDeltas(
          service,
          {
            agentId: binding.agentId,
            previousResponseId: previous?.responseId,
            prompt: message.text,
          },
          async (state) => {
            if (state.pending) await deps.store.kv.set(stateKey, state);
            else completedState = state;
          },
        ),
      );
      // A completed Agent response is settled only after the Slack stream finishes delivery.
      if (completedState) await deps.store.kv.set(stateKey, completedState);
    } finally {
      await deps.store.lock.release(stateKey, lock.token);
    }
  };
  channel.onMention(forward);
  channel.onMessage(forward);
  await channel.ɵruntime.start();

  return {
    async dispatch(body: Record<string, unknown>) {
      if (slackEnvelopeTeamId(body) !== installation.teamId)
        throw new Error('Slack event does not match its installation');
      const event = isRecord(body.event) ? body.event : undefined;
      const message = event && isRecord(event.message) ? event.message : event;
      // Channels 0.11.0 does not carry files into onMessage when runAgent is not used.
      if (event && message && Array.isArray(message.files) && message.files.length > 0) {
        await deps.store.kv.set(`attachment:${event.channel}:${message.ts}`, true, 360_000);
      }
      await receiver.dispatch(body);
    },
    stop: () => channel.ɵruntime.stop(),
  };
}

export async function* slackResponseDeltas(
  service: Pick<ResponsesService, 'createStreamingResponse'>,
  input: { agentId: string; previousResponseId?: string; prompt: string },
  save: (state: ConversationState) => Promise<void>,
) {
  let responseId = input.previousResponseId;
  let settled = false;
  try {
    for await (const event of service.createStreamingResponse({
      input: input.prompt,
      model: input.agentId,
      previous_response_id: input.previousResponseId,
      stream: true,
    })) {
      if (event.type === 'response.created') {
        responseId = event.response.id;
        await save({ pending: true, responseId });
      } else if (event.type === 'response.output_text.delta') {
        yield event.delta;
      } else if (event.type === 'response.completed') {
        await save({ pending: false, responseId: event.response.id });
        settled = true;
      } else if (event.type === 'response.incomplete' || event.type === 'response.failed') {
        await save({ pending: true, responseId });
        yield '\nThis run needs attention. Open Orvilo to inspect its status and approvals.';
        settled = true;
      }
    }
    if (!settled) throw new Error('Agent response ended without a terminal event');
  } catch (error) {
    console.error(
      '[Slack Channels] Agent response failed:',
      error instanceof Error ? error.name : 'unknown',
    );
    // The SDK finishes its stream only when the generator ends normally.
    yield '\nThe Agent response was interrupted. Inspect it in Orvilo before retrying.';
  }
}

type SlackChannelsRuntime = Awaited<ReturnType<typeof createSlackChannelsRuntime>>;
const runtimes = new Map<
  string,
  { installationId: string; revision: string; ready: Promise<SlackChannelsRuntime> }
>();

/** Each installation owns its own Bolt client; replaced credentials invalidate only that instance. */
export async function getSlackChannelsRuntime(
  installation: SlackChannelsInstallation,
  deps: SlackChannelsDependencies,
) {
  const current = runtimes.get(installation.teamId);
  if (
    current?.installationId === installation.id &&
    current.revision === installation.tokenRevision
  )
    return current.ready;
  const ready = (async () => {
    if (current) await (await current.ready).stop();
    return createSlackChannelsRuntime(installation, deps);
  })();
  const entry = { installationId: installation.id, ready, revision: installation.tokenRevision };
  runtimes.set(installation.teamId, entry);
  try {
    return await ready;
  } catch (error) {
    if (runtimes.get(installation.teamId) === entry) runtimes.delete(installation.teamId);
    throw error;
  }
}

export async function stopSlackChannelsRuntime(teamId: string) {
  const current = runtimes.get(teamId);
  if (!current) return;
  runtimes.delete(teamId);
  await (await current.ready).stop();
}
