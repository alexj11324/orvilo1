import { z } from 'zod';

import type { PublicModel } from '../helpers/public-fields';
import type { IPaginationQuery, PaginationQueryResponse } from './common.type';
import { PaginationQuerySchema } from './common.type';

// ==================== Model List Query Types ====================

const MODEL_TYPES = ['chat', 'embedding', 'tts', 'asr', 'text2music', 'realtime'] as const;

// `stt` was renamed to the standard `asr`. It is still accepted on input as a
// deprecated alias (so existing API clients don't break) and normalized to
// `asr` in the service layer; it is never emitted in responses.
const MODEL_TYPE_INPUTS = [...MODEL_TYPES, 'stt'] as const;

/**
 * Model list query parameters
 */
export interface ModelsListQuery extends IPaginationQuery {
  enabled?: boolean;
  provider?: string;
  type?: (typeof MODEL_TYPE_INPUTS)[number];
}

export const ModelsListQuerySchema = PaginationQuerySchema.extend({
  enabled: z
    .string()
    .transform((val) => val === 'true')
    .pipe(z.boolean())
    .nullish(),
  provider: z.string().min(1).max(64).nullish(),
  type: z.enum(MODEL_TYPE_INPUTS).nullish(),
});

// ==================== Model Response Types ====================

export type GetModelsResponse = PaginationQueryResponse<{
  models?: PublicModel[];
}>;

// ==================== Model Detail / Mutation Types ====================

export type ModelDetailResponse = PublicModel;

export const ModelIdParamSchema = z.object({
  modelId: z
    .string()
    .min(1, 'Model ID cannot be empty')
    .max(150, 'Model ID cannot exceed 150 characters'),
  providerId: z
    .string()
    .min(1, 'Provider ID cannot be empty')
    .max(64, 'Provider ID cannot exceed 64 characters'),
});
