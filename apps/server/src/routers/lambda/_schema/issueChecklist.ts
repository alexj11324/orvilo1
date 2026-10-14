import { verifyEvidenceTypes } from '@orvilo/const/verify';
import { z } from 'zod';

export const issueDeliveryProofSchema = z.object({
  taskId: z.string().min(1),
  deliveryOperationId: z.string().min(1),
  topicId: z.string().min(1),
  executionGeneration: z.number().int().nonnegative(),
  dispatchId: z.string().min(1).optional(),
  sourceSha: z
    .string()
    .regex(/^[a-f\d]{40,64}$/i)
    .optional(),
  repo: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  targetBranch: z.string().min(1).optional(),
  checklistRevision: z.number().int().positive(),
  deliveryKind: z.enum(['code', 'artifact']),
});

export const confirmIssueChecklistSchema = z.object({
  taskId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  deliveryKind: z.enum(['code', 'artifact']),
  repo: z.string().min(1).max(500).optional(),
  targetBranch: z.string().min(1).max(500).optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        title: z.string().trim().min(1).max(2000),
        description: z.string().max(10000).optional(),
        required: z.boolean(),
      }),
    )
    .min(1)
    .max(200),
});

export const issueDeliveryDecisionSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().uuid(),
  proof: issueDeliveryProofSchema,
});

export const issueChecklistItemsDecisionSchema = issueDeliveryDecisionSchema.extend({
  resultIds: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['accept', 'reject']),
  comment: z.string().max(10000).optional(),
});

export const submitIssueChecklistReviewSchema = z.object({
  identifier: z.string().min(1),
  runId: z.string().uuid(),
  proof: issueDeliveryProofSchema,
  verdict: z.enum(['pass', 'fail']),
  comment: z.string().max(10000).optional(),
  items: z
    .array(
      z.object({
        checkItemId: z.string().min(1),
        verdict: z.enum(['pass', 'fail', 'uncertain']),
        comment: z.string().trim().min(1).max(10000),
        evidence: z
          .array(
            z.object({
              type: z.enum(verifyEvidenceTypes),
              content: z.string().trim().min(1).max(256000).optional(),
              fileId: z.string().min(1).optional(),
              description: z.string().max(2000).optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(200),
});
