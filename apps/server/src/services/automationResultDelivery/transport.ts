import { ssrfSafeFetch } from '@orvilo/ssrf-safe-fetch';
import type { AutomationRunResult } from '@orvilo/types';
import { z } from 'zod';

export type WebhookDeliveryOutcome =
  | { httpStatus: number; status: 'delivered' }
  | { error: string; httpStatus?: number; status: 'failed' | 'retry' | 'unknown' };

/** Reject URL secrets and redirects; DNS/IP filtering is enforced again on every actual request. */
export const validateResultWebhookEndpoint = (endpoint: string): string => {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    endpoint.length > 2048
  ) {
    throw new Error('Result webhook requires an HTTPS URL without credentials, query or fragment');
  }
  return url.toString();
};

/** Shared publication and delivery boundary, including legacy loose task config. */
export const automationResultWebhookConfigSchema = z.object({
  credentialId: z.string().min(1).optional(),
  id: z
    .string()
    .min(1)
    .max(100)
    .refine((id) => id !== 'inbox'),
  url: z
    .string()
    .max(2048)
    .refine((url) => {
      try {
        validateResultWebhookEndpoint(url);
        return true;
      } catch {
        return false;
      }
    }),
});

export const sendResultWebhook = async (params: {
  authorization?: string;
  deliveryId: string;
  endpoint: string;
  payload: AutomationRunResult;
}): Promise<WebhookDeliveryOutcome> => {
  let endpoint: string;
  try {
    endpoint = validateResultWebhookEndpoint(params.endpoint);
  } catch {
    return { error: 'CONFIGURATION_INVALID', status: 'failed' };
  }

  try {
    const response = await ssrfSafeFetch(
      endpoint,
      {
        body: JSON.stringify(params.payload),
        headers: {
          ...(params.authorization ? { Authorization: params.authorization } : {}),
          'Content-Type': 'application/json',
          'Idempotency-Key': params.deliveryId,
          'X-Orvilo-Delivery-Id': params.deliveryId,
        },
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      },
      // Outbound result hooks never inherit the deployment's private-network exceptions.
      { allowIPAddressList: [], allowPrivateIPAddress: false, maxContentLength: 4096 },
    );
    if (response.ok) return { httpStatus: response.status, status: 'delivered' };
    return {
      error: `HTTP_${response.status}`,
      httpStatus: response.status,
      status: response.status === 429 || response.status >= 500 ? 'retry' : 'failed',
    };
  } catch (error) {
    // A broken socket/timeout cannot establish whether the receiver committed a write.
    // Never silently replay these ambiguous deliveries. Do not persist raw errors/URL secrets.
    const blocked = error instanceof Error && error.message.includes('SSRF blocked');
    return {
      error: blocked ? 'ENDPOINT_BLOCKED' : 'DELIVERY_RESULT_UNKNOWN',
      status: blocked ? 'failed' : 'unknown',
    };
  }
};
