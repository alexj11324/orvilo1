import type { Command } from 'commander';

import { registerOrchestrationWorkflowInspectCommand } from './inspect';
import { registerOrchestrationWorkflowListCommand } from './list';

/**
 * `orvilo trace orchestration-workflow` — traces of a whole orchestration workflow run, one scale above `orvilo trace op`.
 * A orchestration workflow's advances dispatch operations, so an advance's `op=` hands off to
 * `orvilo trace op inspect`.
 */
export function registerOrchestrationWorkflowCommand(parent: Command) {
  const orchestrationWorkflow = parent
    .command('orchestration-workflow')
    .description('Traces of a whole orchestration workflow run');

  registerOrchestrationWorkflowInspectCommand(orchestrationWorkflow);
  registerOrchestrationWorkflowListCommand(orchestrationWorkflow);
}
