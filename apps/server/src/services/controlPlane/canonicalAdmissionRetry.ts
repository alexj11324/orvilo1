/** Postgres contention classes the canonical admission row locks can raise:
 * `55P03` NOWAIT lock collision, `40P01` deadlock, `40001` serialization
 * failure. A queued next-turn admission lands inside the in-flight run's
 * per-event authority windows — those collisions are transient, not real
 * denials, so the transaction retries inside a bounded window before the
 * caller's `.catch` maps it to "admission is busy or unavailable". */
const RETRYABLE_PG_CODES = new Set(['40P01', '40001', '55P03']);

const BACKOFF_MS = [25, 50, 100, 200, 400];

const pgErrorCode = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string') return code;
  const cause = (error as { cause?: unknown } | null | undefined)?.cause;
  const causeCode = (cause as { code?: unknown } | null | undefined)?.code;
  return typeof causeCode === 'string' ? causeCode : undefined;
};

export const withCanonicalAdmissionRetry = async <T>(transact: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await transact();
    } catch (error) {
      const delay = BACKOFF_MS[attempt];
      if (delay === undefined || !RETRYABLE_PG_CODES.has(pgErrorCode(error) ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
