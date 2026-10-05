import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import { HeterogeneousAgentTypeSchema, normalizeAgencyConfigForWrite } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const RuntimeAgencyConfigSchema = z
  .object({
    heterogeneousProvider: z
      .object({ type: HeterogeneousAgentTypeSchema })
      .passthrough()
      .default({ type: 'orvilo' }),
  })
  .passthrough();

/** New writes must declare a real runtime; legacy inference is read-only. */
export const normalizeAgentRuntimeIdentity = (
  agencyConfig: OrviloAgentAgencyConfig | null | undefined,
): OrviloAgentAgencyConfig => {
  const result = RuntimeAgencyConfigSchema.safeParse(agencyConfig ?? {});
  if (!result.success) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'An agent must use Orvilo or a supported external agent runtime',
    });
  }
  return normalizeAgencyConfigForWrite(result.data as OrviloAgentAgencyConfig);
};
