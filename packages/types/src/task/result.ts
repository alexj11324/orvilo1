/** Destination configuration contains references only; credential values never leave the vault. */
export interface AutomationResultWebhookConfig {
  credentialId?: string;
  id: string;
  url: string;
}

/** A settled occurrence's result, independent of output delivery state. */
export interface AutomationRunResult {
  completedAt: string;
  evidence: {
    definitionVersionId?: string;
    dispatchId?: string;
    generation?: number;
    occurrenceId?: string;
  };
  identifier: string;
  runId: string;
  status: 'succeeded' | 'failed' | 'canceled' | 'limited' | 'unknown';
  stopReason: string;
  summary: string;
  taskId: string;
  topicId?: string;
  version: 1;
}
