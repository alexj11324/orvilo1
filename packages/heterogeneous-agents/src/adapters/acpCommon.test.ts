import { describe, expect, it } from 'vitest';

import {
  MAX_ACP_SESSION_TITLE_LENGTH,
  parseAcpSessionTitle,
  parseAcpSessionTitleMessage,
} from './acpCommon';

const infoUpdate = (fields: Record<string, unknown>) => ({
  sessionUpdate: 'session_info_update',
  ...fields,
});

describe('parseAcpSessionTitle', () => {
  it('returns the trimmed title of a session_info_update', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: '  Fix the login bug  ' }))).toBe(
      'Fix the login bug',
    );
  });

  it('ignores an update that carries no title', () => {
    // Prime sends many `_meta`-only updates; `updatedAt` alone is bookkeeping.
    expect(parseAcpSessionTitle(infoUpdate({ _meta: { tokens: 12 } }))).toBeUndefined();
    expect(parseAcpSessionTitle(infoUpdate({ updatedAt: '2026-10-09T00:00:00Z' }))).toBeUndefined();
  });

  it('treats null, blank and non-string titles as no title', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: null }))).toBeUndefined();
    expect(parseAcpSessionTitle(infoUpdate({ title: '   \n ' }))).toBeUndefined();
    expect(parseAcpSessionTitle(infoUpdate({ title: 42 }))).toBeUndefined();
    expect(parseAcpSessionTitle(infoUpdate({ title: { text: 'x' } }))).toBeUndefined();
  });

  it('ignores other update kinds, even when they carry a title field', () => {
    expect(
      parseAcpSessionTitle({ sessionUpdate: 'agent_message_chunk', title: 'nope' }),
    ).toBeUndefined();
    expect(parseAcpSessionTitle(undefined)).toBeUndefined();
    expect(parseAcpSessionTitle('session_info_update')).toBeUndefined();
  });

  it('flattens newlines and caps an over-long title', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: 'a\nb\t c' }))).toBe('a b c');

    const long = parseAcpSessionTitle(infoUpdate({ title: 'x'.repeat(5000) }));
    expect(long).toHaveLength(MAX_ACP_SESSION_TITLE_LENGTH);
  });

  it('keeps markup as plain text', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: '<img src=x onerror=alert(1)>' }))).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});

describe('parseAcpSessionTitleMessage', () => {
  const message = (update: unknown, extra: Record<string, unknown> = {}) => ({
    method: 'session/update',
    params: { sessionId: 's1', update, ...extra },
  });

  it('reads the title off a live session/update notification', () => {
    expect(parseAcpSessionTitleMessage(message(infoUpdate({ title: 'Hello' })))).toBe('Hello');
  });

  it('ignores other methods and replayed history', () => {
    expect(
      parseAcpSessionTitleMessage({ ...message(infoUpdate({ title: 'Hello' })), method: 'x' }),
    ).toBeUndefined();
    expect(
      parseAcpSessionTitleMessage(
        message(infoUpdate({ title: 'Hello' }), { _meta: { isReplay: true } }),
      ),
    ).toBeUndefined();
    expect(
      parseAcpSessionTitleMessage(message(infoUpdate({ _meta: { isReplay: true }, title: 'Old' }))),
    ).toBeUndefined();
  });
});
