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

  it('strips control, zero-width and bidi characters before trimming', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: '\u0007\u0000Fix\u001B[31m bug\u0085' }))).toBe(
      'Fix [31m bug',
    );
    expect(parseAcpSessionTitle(infoUpdate({ title: '\u200B\u200C\u200D\u2060\uFEFF Hi' }))).toBe(
      'Hi',
    );
    expect(parseAcpSessionTitle(infoUpdate({ title: 'abc\u202Edef\u2066ghi\u2069' }))).toBe(
      'abc def ghi',
    );
  });

  it('rejects a title with nothing printable left', () => {
    expect(
      parseAcpSessionTitle(infoUpdate({ title: '\u200B\u202E\u0000\uFEFF \n' })),
    ).toBeUndefined();
  });

  it('caps at 100 characters on a code point boundary', () => {
    expect(MAX_ACP_SESSION_TITLE_LENGTH).toBe(100);
    const emoji = parseAcpSessionTitle(infoUpdate({ title: '😀'.repeat(150) }))!;
    expect([...emoji]).toHaveLength(100);
    expect(emoji).toBe('😀'.repeat(100));
    // a surrogate pair straddling the UTF-16 cut is kept whole or dropped, never split
    const straddle = parseAcpSessionTitle(infoUpdate({ title: `${'a'.repeat(99)}😀tail` }))!;
    expect(straddle).toBe(`${'a'.repeat(99)}😀`);
    expect(straddle).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('drops lone surrogates', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: 'a\uD83Db\uDE00c' }))).toBe('abc');
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
