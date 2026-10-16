import type { OrviloDatabase } from '@/database/type';

export interface VerifySweepOutcome {
  abandoned: string[];
  settled: string[];
  skipped: number;
}

/** Old scheduled deliveries are acknowledged without recovering or repairing runs. */
export const sweepStuckVerifyRuns = async (
  _db: OrviloDatabase,
  _options?: { now?: Date; pageSize?: number },
): Promise<VerifySweepOutcome> => ({ abandoned: [], settled: [], skipped: 0 });
