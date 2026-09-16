import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseLinearWebhookPayload, verifyLinearWebhookSignature } from './index';
import { mergeLinearIssueSnapshots } from './merge';

const payload = JSON.stringify({
  action: 'update',
  data: { id: 'issue-1', identifier: 'ENG-1', title: 'Issue' },
  organizationId: 'org-1',
  type: 'Issue',
  webhookTimestamp: 1_700_000_000_000,
});

describe('Linear webhook verification', () => {
  it('verifies the raw body and rejects a stale delivery', () => {
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_000_030,
        rawBody: payload,
        secret,
        signature,
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(true);

    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_061_000,
        rawBody: payload,
        secret,
        signature,
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it('rejects a changed body and malformed signature', () => {
    const signature = createHmac('sha256', 'test-secret').update(payload).digest('hex');

    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_000_030,
        rawBody: payload.replace('Issue', 'Changed'),
        secret: 'test-secret',
        signature,
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(false);
    expect(
      verifyLinearWebhookSignature({
        now: 1_700_000_000_030,
        rawBody: payload,
        secret: 'test-secret',
        signature: 'not-hex',
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it('parses the organization and webhook timestamp required for routing', () => {
    expect(parseLinearWebhookPayload(payload)).toMatchObject({
      action: 'update',
      organizationId: 'org-1',
      type: 'Issue',
      webhookTimestamp: 1_700_000_000_000,
    });
    expect(() =>
      parseLinearWebhookPayload(
        '{"action":"update","type":"Issue","webhookTimestamp":1700000000000}',
      ),
    ).toThrow('organizationId');
  });
});

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: 'issue-1',
  identifier: 'ENG-1',
  title: 'Base title',
  ...overrides,
});

describe('mergeLinearIssueSnapshots', () => {
  it('accepts independent local and remote changes without clobbering either', () => {
    const result = mergeLinearIssueSnapshots({
      base: snapshot({ description: 'Base description' }),
      local: snapshot({ description: 'Local description' }),
      remote: snapshot({ description: 'Base description', priority: 1 }),
    });

    expect(result.conflicts).toBeNull();
    expect(result.merged).toMatchObject({
      description: 'Local description',
      priority: 1,
    });
  });

  it('keeps both values visible when the same field changed differently', () => {
    const result = mergeLinearIssueSnapshots({
      base: snapshot(),
      local: snapshot({ title: 'Local title' }),
      remote: snapshot({ title: 'Remote title' }),
    });

    expect(result.merged.title).toBe('Local title');
    expect(result.conflicts).toMatchObject({
      fields: ['title'],
      local: { title: 'Local title' },
      remote: { title: 'Remote title' },
    });
  });
});
