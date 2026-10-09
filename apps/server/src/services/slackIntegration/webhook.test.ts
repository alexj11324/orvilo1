import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  parseSlackWebhookBody,
  slackConversationLane,
  verifySlackWebhookSignature,
} from './webhook';

const secret = 'test-signing-secret';
const timestamp = '1791546000';
const body = '{"type":"event_callback","team_id":"T123","event_id":"Ev123"}';
const signature = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;

describe('Slack webhook trust boundary', () => {
  it('serializes mentions, replies and actions from the same thread before SDK deduplication', () => {
    const mention = { event: { channel: 'C1', ts: '1.0', type: 'app_mention' } };
    const reply = { event: { channel: 'C1', thread_ts: '1.0', ts: '2.0', type: 'message' } };
    const action = { channel: { id: 'C1' }, message: { thread_ts: '1.0', ts: '3.0' } };
    expect(slackConversationLane('T1', mention)).toBe(slackConversationLane('T1', reply));
    expect(slackConversationLane('T1', action)).toBe(slackConversationLane('T1', reply));
    expect(slackConversationLane('T2', mention)).not.toBe(slackConversationLane('T1', reply));
    expect(slackConversationLane('T1', { event: { channel: 'C1', ts: '4.0' } })).not.toBe(
      slackConversationLane('T1', reply),
    );
  });
  it('accepts the exact signed bytes and rejects tampering, stale timestamps and malformed signatures', () => {
    const input = { body, now: Number(timestamp) * 1000, secret, signature, timestamp };
    expect(verifySlackWebhookSignature(input)).toBe(true);
    expect(verifySlackWebhookSignature({ ...input, body: `${body} ` })).toBe(false);
    expect(verifySlackWebhookSignature({ ...input, now: input.now + 301_000 })).toBe(false);
    expect(verifySlackWebhookSignature({ ...input, now: input.now - 301_000 })).toBe(false);
    expect(verifySlackWebhookSignature({ ...input, signature: 'v0=bad' })).toBe(false);
    expect(verifySlackWebhookSignature({ ...input, timestamp: '' })).toBe(false);
  });

  it('parses Events API and interactive payloads without accepting an unbound team', () => {
    expect(parseSlackWebhookBody(body, 'application/json')).toMatchObject({ teamId: 'T123' });
    const action = { team: { id: 'T123' }, type: 'block_actions', user: { id: 'U123' } };
    expect(
      parseSlackWebhookBody(
        new URLSearchParams({ payload: JSON.stringify(action) }).toString(),
        'application/x-www-form-urlencoded',
      ),
    ).toEqual({ body: action, teamId: 'T123' });
    expect(() => parseSlackWebhookBody('{"type":"event_callback"}', 'application/json')).toThrow();
    expect(() => parseSlackWebhookBody('[]', 'application/json')).toThrow();
    expect(() => parseSlackWebhookBody('bad', 'application/json')).toThrow();
  });
});
