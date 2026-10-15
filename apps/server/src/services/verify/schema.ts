import {
  REVIEW_PREDICTION_ACTIONS,
  VERIFY_EVIDENCE_MODALITIES,
  VERIFY_EVIDENCE_SCOPES,
  VERIFY_EVIDENCE_TYPES,
  VERIFY_ON_FAIL_ACTIONS,
  VERIFY_VERIFIER_TYPES,
} from '@orvilo/prompts';
import { z } from 'zod';

// ============================================
// Plan generation — AI proposes additional check criteria for a run
// ============================================

const requiredEvidenceSchema = z.object({
  hint: z.string().optional(),
  modality: z.enum(VERIFY_EVIDENCE_MODALITIES).optional(),
  scope: z.enum(VERIFY_EVIDENCE_SCOPES).optional(),
  type: z.enum(VERIFY_EVIDENCE_TYPES),
});

/** Lenient parse of the AI plan-gen output; the service filters/normalizes. */
export const RawGeneratedCriteriaSchema = z.object({
  criteria: z.array(
    z.object({
      description: z.string().optional(),
      instruction: z.string().optional(),
      onFail: z.enum(VERIFY_ON_FAIL_ACTIONS).optional(),
      requiredEvidence: z.array(requiredEvidenceSchema).optional(),
      required: z.boolean().optional(),
      title: z.string(),
      verifierType: z.enum(VERIFY_VERIFIER_TYPES),
    }),
  ),
});

export type RawGeneratedCriteria = z.infer<typeof RawGeneratedCriteriaSchema>;

// ============================================
// Report — LLM narrative over a run's check results + evidence
// ============================================

/**
 * Only the narrative is LLM-authored; the verdict + statistics are computed
 * deterministically from the results, so the report card can never disagree with
 * the underlying rollup.
 */
export const ReportNarrativeSchema = z.object({
  content: z.string(),
  summary: z.string(),
});
export type ReportNarrative = z.infer<typeof ReportNarrativeSchema>;

// ============================================
// Review prediction — a second opinion on one already-judged check
// ============================================

/**
 * Lenient on purpose: `strict: true` forces every property into `required`, so
 * the provider returns explicit `null` for the ones it had nothing to say about
 * — hence `.nullish()` rather than `.optional()` throughout.
 */
export const ReviewPredictionSchema = z.object({
  action: z.enum(REVIEW_PREDICTION_ACTIONS),
  comment: z.string().nullish(),
  confidence: z.number().nullish(),
  rationale: z.string().nullish(),
  regions: z
    .array(
      z.object({
        comment: z.string().nullish(),
        height: z.number(),
        imageIndex: z.number(),
        width: z.number(),
        x: z.number(),
        y: z.number(),
      }),
    )
    .nullish(),
});
export type RawReviewPrediction = z.infer<typeof ReviewPredictionSchema>;
