import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ALWAYS_RELATIVE, useActivityTime } from './useActivityTime';

// A timestamp far enough back that the default threshold (one day) always
// flips it to an absolute date, whatever `now` the runner uses.
const DISTANT = '2000-01-01T00:00:00Z';

describe('useActivityTime', () => {
  it('keeps the always-relative preset relative however old the entry is', () => {
    const { result } = renderHook(() => useActivityTime(DISTANT, ALWAYS_RELATIVE));

    // dayjs' English relative strings end in "ago"; an absolute date never does.
    expect(result.current.text).toMatch(/ago$/);
    expect(result.current.text).not.toMatch(/\d{4}\//);
    // The absolute datetime still carries over as the tooltip title.
    expect(result.current.title).toMatch(/^2000/);
  });

  it('leaves the default threshold alone: old entries still go absolute', () => {
    const { result } = renderHook(() => useActivityTime(DISTANT));

    expect(result.current.text).not.toMatch(/ago$/);
  });

  it('still honors the caller-provided `now` inside the preset', () => {
    const { result } = renderHook(() =>
      useActivityTime('2026-04-29T10:00:00Z', {
        ...ALWAYS_RELATIVE,
        now: '2026-05-01T10:00:00Z',
      }),
    );

    expect(result.current.text).toMatch(/ago$/);
  });
});
