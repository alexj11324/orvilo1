// @vitest-environment node
/**
 * `withCanonicalAdmissionRetry` retries transient Postgres contention
 * (NOWAIT row-lock `55P03`, deadlock `40P01`, serialization `40001`) inside a
 * bounded window — a queued next-turn admission lands inside the in-flight
 * run's per-event authority locks, and before the retry existed the whole
 * chat run failed "Canonical admission is busy or unavailable" on a single
 * collision. Real denials and unrelated errors never retry. */
import { describe, expect, it } from 'vitest';

import { withCanonicalAdmissionRetry } from './canonicalAdmissionRetry';

const pgError = (code: string) => Object.assign(new Error('pg contention'), { code });

describe('withCanonicalAdmissionRetry', () => {
  it('returns the first successful result without retrying', async () => {
    let calls = 0;
    const value = await withCanonicalAdmissionRetry(async () => {
      calls += 1;
      return 'admitted';
    });
    expect(value).toBe('admitted');
    expect(calls).toBe(1);
  });

  it('retries a transient lock contention code and returns the later result', async () => {
    let calls = 0;
    const value = await withCanonicalAdmissionRetry(async () => {
      calls += 1;
      if (calls < 3) throw pgError('55P03');
      return 'admitted';
    });
    expect(value).toBe('admitted');
    expect(calls).toBe(3);
  });

  it.each(['40P01', '40001', '55P03'])('treats pg code %s as retryable', async (code) => {
    let calls = 0;
    const value = await withCanonicalAdmissionRetry(async () => {
      calls += 1;
      if (calls === 1) throw pgError(code);
      return 'admitted';
    });
    expect(value).toBe('admitted');
    expect(calls).toBe(2);
  });

  it('propagates non-contention errors without retrying', async () => {
    let calls = 0;
    await expect(
      withCanonicalAdmissionRetry(async () => {
        calls += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });

  it('gives up after the bounded backoff window', async () => {
    let calls = 0;
    await expect(
      withCanonicalAdmissionRetry(async () => {
        calls += 1;
        throw pgError('55P03');
      }),
    ).rejects.toThrow('pg contention');
    expect(calls).toBe(6);
  });
});
