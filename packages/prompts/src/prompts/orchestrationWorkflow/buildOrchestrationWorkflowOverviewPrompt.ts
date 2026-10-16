// ── OrchestrationWorkflow progress overview for the orchestration workflow-page side conversation ──
//
// The orchestration workflow detail page hosts a chat with the orchestration workflow's responsible agent so a
// user can ask "how is this going?" in plain language. The page already holds
// the full OrchestrationWorkflow Graph snapshot, so the client distills it into this block and
// injects it into the last user message (same channel as the Task Manager
// context) — the agent answers from the on-screen state without tool calls.

import type { InitialOrchestrationWorkflowOverviewContext } from '@orvilo/types';

export type BuildOrchestrationWorkflowOverviewPromptInput =
  InitialOrchestrationWorkflowOverviewContext;

/**
 * OrchestrationWorkflow overview prompt for the orchestration workflow-page conversational reference.
 */
export const buildOrchestrationWorkflowOverviewPrompt = (
  input: BuildOrchestrationWorkflowOverviewPromptInput,
): string => {
  const { findings, orchestrationWorkflow, pendingDecisions, tasks } = input;

  const lines: string[] = [
    '<orchestration_workflow_overview>',
    `<hint>The user is currently viewing this Orchestration workflow's progress page and their questions are about it. Answer from this snapshot of the on-screen state — do not claim you cannot see the orchestration workflow, and do not re-fetch it.</hint>`,
    `Orchestration workflow: ${orchestrationWorkflow.title} [${orchestrationWorkflow.status}]`,
  ];

  if (orchestrationWorkflow.requirement?.trim())
    lines.push(`Requirement: ${orchestrationWorkflow.requirement.trim()}`);

  if (tasks.length > 0) {
    lines.push('', `Tasks (${tasks.length}):`);
    for (const item of tasks) {
      const seq = item.seq ? `#${item.seq} ` : '';
      const attempts = item.attempts && item.attempts > 1 ? `  (attempt ${item.attempts})` : '';
      lines.push(`  ${seq}[${item.status}] ${item.title}${attempts}`);
    }
  }

  if (findings.length > 0) {
    lines.push('', `Findings (${findings.length}):`);
    for (const finding of findings) lines.push(`  - ${finding}`);
  }

  if (pendingDecisions.length > 0) {
    lines.push('', `Pending decisions waiting on the user (${pendingDecisions.length}):`);
    for (const decision of pendingDecisions) lines.push(`  - ${decision.question}`);
  }

  lines.push('</orchestration_workflow_overview>');
  return lines.join('\n');
};
