import { findRetiredAgencyConfigFields } from '@orvilo/types';
import { z } from 'zod';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * zod `superRefine` callback refusing writes that carry retired
 * `agencyConfig.heterogeneousProvider` fields (`engine`, `adapterType`).
 *
 * The Prime cutover deleted the Orvilo engine model: stored rows still
 * holding those keys are stripped at read by
 * `normalizeHeterogeneousProviderConfig`, but the request schema must refuse
 * NEW writes — otherwise a client re-saving a stale row keeps the retired
 * preference alive indefinitely (device-execution-contract §migration).
 *
 * Apply on any input object that carries an `agencyConfig` patch:
 * `.superRefine(refuseRetiredAgencyConfigFields)`. Also pass the provider
 * patch itself when the input IS the agencyConfig (e.g. a bare
 * `heterogeneousProvider` field) — the helper looks at `value.agencyConfig`
 * first and falls back to `value` for agencyConfig-shaped payloads.
 */
export const refuseRetiredAgencyConfigFields = (value: unknown, ctx: z.RefinementCtx): void => {
  const agencyConfig = isRecord(value) && 'agencyConfig' in value ? value.agencyConfig : value;
  for (const field of findRetiredAgencyConfigFields(agencyConfig)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        `${field} is retired — the builtin Orvilo agent is bound to Prime, fixed. ` +
        'Remove the field and retry.',
      path: ['agencyConfig', ...field.split('.')],
    });
  }
};
