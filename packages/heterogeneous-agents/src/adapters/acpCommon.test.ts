import { describe, expect, it } from 'vitest';

import {
  MAX_ACP_SESSION_TITLE_INPUT_LENGTH,
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

  it('strips control, zero-width and bidi characters', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: '\u0007\u0000Fix\u001B[31m bug\u0085' }))).toBe(
      'Fix[31m bug',
    );
    expect(parseAcpSessionTitle(infoUpdate({ title: '\u200B\u200C\u200D\u2060\uFEFF Hi' }))).toBe(
      'Hi',
    );
    expect(parseAcpSessionTitle(infoUpdate({ title: '\u202Eabc\u2066def\u2069' }))).toBe('abcdef');
  });

  it.each([
    ['LRM/RLM', 'a\u200Eb\u200Fc'],
    ['soft hyphen', 'a\u00ADb\u00ADc'],
    ['invisible separator', 'a\u2063b\u2063c'],
    ['deprecated format controls', 'a\u206Ab\u206Fc'],
    ['arabic letter mark', 'a\u061Cb\u061Cc'],
    ['interlinear annotation', 'a\uFFF9b\uFFFBc'],
    ['mongolian selectors', 'a\u180Bb\u180Fc'],
    ['combining grapheme joiner', 'a\u034Fb\u034Fc'],
    ['hangul fillers', 'a\u115Fb\u1160c\u3164\uFFA0'],
    ['private use', 'a\uE000b\uF8FFc'],
    ['tag characters', 'a\u{E0041}b\u{E0042}c'],
    ['unassigned code point', 'a\u0378b\u0378c'],
  ])('removes %s without leaving a gap', (_name, title) => {
    const cleaned = parseAcpSessionTitle(infoUpdate({ title }));
    expect(cleaned?.slice(0, 3)).toBe('abc');
  });

  it('removes a hidden tag-character payload entirely', () => {
    const payload = [...'IGNORE']
      .map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0)))
      .join('');
    expect(parseAcpSessionTitle(infoUpdate({ title: `Fix bug${payload}` }))).toBe('Fix bug');
  });

  it('still separates words with tabs, newlines and carriage returns', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: 'a\tb\nc\r\nd\u2028e' }))).toBe('a b c d e');
  });

  it('cleans a bidi-prefixed title', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: '\u202E\u2067Fix login\u2069\u202C' }))).toBe(
      'Fix login',
    );
  });

  it('rejects a title that is invisible only', () => {
    for (const title of [
      '\u200E\u200F',
      '\u00AD\u2063\u206A',
      '\u{E0041}\u{E0042}',
      '\u3164\uFFA0\u115F',
      '\u0301\u0301',
      '\uE000',
      '\u2800\u2800',
      ' \u00A0 ',
    ]) {
      expect(parseAcpSessionTitle(infoUpdate({ title }))).toBeUndefined();
    }
  });

  it('keeps emoji, including a ZWJ family sequence (ZWJ is kept only between pictographs)', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: '🚀 Launch ❤️' }))).toBe('🚀 Launch ❤️');
    const family = '👨\u200D👩\u200D👧';
    expect(parseAcpSessionTitle(infoUpdate({ title: `${family} trip` }))).toBe(`${family} trip`);
    // a ZWJ hidden in text is not between pictographs, so it goes
    expect(parseAcpSessionTitle(infoUpdate({ title: 'a\u200Db' }))).toBe('ab');
  });

  it('keeps a ZWJ after a skin-tone modifier', () => {
    const technologist = '\u{1F469}\u{1F3FD}‍\u{1F4BB}';
    expect(parseAcpSessionTitle(infoUpdate({ title: `${technologist} pairing` }))).toBe(
      `${technologist} pairing`,
    );
  });

  it('strips variation selectors but keeps the emoji presentation selector', () => {
    expect(parseAcpSessionTitle(infoUpdate({ title: 'a︀b︎c\u{E0100}d឴e឵f' }))).toBe('abcdef');
    expect(parseAcpSessionTitle(infoUpdate({ title: '❤️ ok' }))).toBe('❤️ ok');
  });

  it('never ends on a dangling joiner when the cap lands inside a ZWJ sequence', () => {
    const pair = '\u{1F468}‍';
    const capped = parseAcpSessionTitle(infoUpdate({ title: pair.repeat(80) }))!;
    expect(capped.endsWith('‍')).toBe(false);
    expect([...capped].length).toBeLessThanOrEqual(MAX_ACP_SESSION_TITLE_LENGTH);
  });

  it('only scans a bounded prefix of an enormous title', () => {
    expect(MAX_ACP_SESSION_TITLE_INPUT_LENGTH).toBe(2000);
    const hidden = `${'​'.repeat(MAX_ACP_SESSION_TITLE_INPUT_LENGTH)}visible`;
    // the visible tail sits past the scanned prefix, so nothing printable is left
    expect(parseAcpSessionTitle(infoUpdate({ title: hidden }))).toBeUndefined();
    const startedAt = performance.now();
    const title = parseAcpSessionTitle(infoUpdate({ title: `Report ${'‮'.repeat(5_000_000)}` }));
    expect(title).toBe('Report');
    expect(performance.now() - startedAt).toBeLessThan(500);
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
