import type { Command } from 'commander';

import { registerOpCommand } from './op';
import { registerOrchestrationWorkflowCommand } from './orchestrationWorkflow';

export function registerTraceCommand(program: Command) {
  const trace = program
    .command('trace')
    .description('Inspect and replay recorded agent execution traces');

  registerOpCommand(trace);
  registerOrchestrationWorkflowCommand(trace);
}
