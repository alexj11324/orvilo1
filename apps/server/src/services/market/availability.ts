import { TRPCError } from '@trpc/server';

/** An unconfigured broker must not fall through to the historical hosted URL. */
export const assertMarketConfigured = () => {
  if (!process.env.MARKET_BASE_URL?.trim()) {
    throw new TRPCError({
      cause: { data: { code: 'MARKET_UNAVAILABLE' } },
      code: 'SERVICE_UNAVAILABLE',
      message: 'Market is not configured for this deployment',
    });
  }
};
