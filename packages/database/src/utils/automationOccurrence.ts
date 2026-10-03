import { createHash } from 'node:crypto';

import type { AutomationDefinitionSnapshot, TaskItem } from '@orvilo/types';

import { stableStringify } from '../repositories/ftsSearchDocument/fingerprint';

/** Task edits already pass the task mutation authorization boundary. */
export const snapshotAutomationDefinition = (task: TaskItem): AutomationDefinitionSnapshot => {
  const definition = {
    assigneeAgentId: task.assigneeAgentId,
    automationMode: task.automationMode,
    heartbeatInterval: task.heartbeatInterval,
    schedulePattern: task.schedulePattern,
    scheduleTimezone: task.scheduleTimezone,
    config: task.config,
    editorData: task.editorData,
    instruction: task.instruction,
    policyRevision: task.policyRevision,
    requirementRevision: task.requirementRevision,
  };
  return {
    ...definition,
    definitionVersionId: `${task.id}:${createHash('sha256').update(stableStringify(definition)).digest('hex')}`,
  };
};
