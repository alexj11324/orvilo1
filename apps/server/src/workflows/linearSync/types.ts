import { z } from 'zod';

export const LinearSyncWorkflowPayloadSchema = z.object({
  dryRun: z.boolean().default(false),
  installationId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  workspaceId: z.string().min(1),
});

export type LinearSyncWorkflowInput = z.input<typeof LinearSyncWorkflowPayloadSchema>;
export type LinearSyncWorkflowPayload = z.output<typeof LinearSyncWorkflowPayloadSchema>;

export interface LinearSyncWorkflowResult {
  dryRun: boolean;
  installations: number;
  scheduled: number;
}

export interface LinearSyncInstallationResult {
  continuationScheduled: boolean;
  inbox: { failed: number; imported: number; pendingBinding: number; processed: number };
  installationId: string;
  nextWakeAt: string | null;
  outbox: { failed: number; sent: number };
  planning: { failed: number; processed: number; proposed: number };
}
