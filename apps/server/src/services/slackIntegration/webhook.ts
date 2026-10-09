import { createHmac, timingSafeEqual } from 'node:crypto';

import { slackCodec } from '@copilotkit/channels-slack/codec';
import { isRecord } from '@orvilo/utils';

/** Slack signs the untouched request body and a five-minute timestamp window. */
export const verifySlackWebhookSignature = (input: {
  body: string;
  now?: number;
  secret: string;
  signature?: string;
  timestamp?: string;
}): boolean => {
  if (!input.timestamp || !/^\d+$/.test(input.timestamp)) return false;
  if (!input.signature || !/^v0=[a-f0-9]{64}$/.test(input.signature)) return false;
  const timestamp = Number(input.timestamp) * 1000;
  if (!Number.isSafeInteger(timestamp) || Math.abs((input.now ?? Date.now()) - timestamp) > 300_000)
    return false;
  const digest = createHmac('sha256', input.secret)
    .update(`v0:${input.timestamp}:${input.body}`)
    .digest();
  return timingSafeEqual(digest, Buffer.from(input.signature.slice(3), 'hex'));
};

export const parseSlackWebhookBody = (raw: string, contentType: string) => {
  const body: unknown = JSON.parse(
    contentType.startsWith('application/x-www-form-urlencoded')
      ? new URLSearchParams(raw).get('payload') || 'null'
      : raw,
  );
  if (!isRecord(body)) throw new Error('Invalid Slack payload');
  if (body.type === 'url_verification' && typeof body.challenge === 'string')
    return { body, challenge: body.challenge, teamId: undefined };
  const teamId =
    typeof body.team_id === 'string'
      ? body.team_id
      : isRecord(body.team) && typeof body.team.id === 'string'
        ? body.team.id
        : undefined;
  if (!teamId) throw new Error('Missing Slack team');
  return { body, teamId };
};

/** A mention and every reply to it share one durable worker lane. */
export const slackConversationLane = (teamId: string, body: Record<string, unknown>) => {
  const event = isRecord(body.event) ? body.event : undefined;
  // Reuse the same pure codec as the Slack adapter: edits/deletes carry a nested
  // logical message, and unthreaded DMs share one conversation per channel.
  const normalized = slackCodec.normalizeIngress({ event });
  if (normalized?.kind === 'turn') {
    return JSON.stringify([teamId, normalized.channel, normalized.threadTs ?? null]);
  }
  const channel = isRecord(body.channel) ? body.channel.id : event?.channel;
  const message = isRecord(body.message) ? body.message : event;
  const thread = message?.thread_ts ?? message?.ts;
  return JSON.stringify([
    teamId,
    typeof channel === 'string' ? channel : null,
    typeof thread === 'string' ? thread : null,
  ]);
};
