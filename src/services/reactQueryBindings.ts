/** Domain-scoped bindings for existing React Query consumers. Keep their cache,
 * mutation callbacks and provider semantics while hiding transport construction.
 */
import { lambdaQuery } from '@/libs/trpc/client';

export const credentialQueries = lambdaQuery.creds;
export const deviceQueries = lambdaQuery.device;
export const chunkQueries = lambdaQuery.chunk;
export const exporterQueries = lambdaQuery.exporter;
export const oauthDeviceFlowQueries = lambdaQuery.oauthDeviceFlow;
export const useOAuthDeviceFlowUtils = () => lambdaQuery.useUtils().oauthDeviceFlow;
