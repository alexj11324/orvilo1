import { buildOrchestrationWorkflowOverviewPrompt } from '@orvilo/prompts';
import type { InitialOrchestrationWorkflowOverviewContext } from '@orvilo/types';
import debug from 'debug';

import { BaseProcessor } from '../base/BaseProcessor';
import type { Message, PipelineContext, ProcessorOptions } from '../types';

const log = debug('context-engine:provider:OrchestrationWorkflowContextSyntheticInjector');

const makeSyntheticToolCallId = () => `synthetic-getOrchestrationWorkflowContext-${Date.now()}`;

export interface OrchestrationWorkflowContextSyntheticInjectorConfig {
  enabled?: boolean;
  /**
   * Structured snapshot of the viewed orchestration workflow — the injector owns rendering it
   * into the synthetic `getOrchestrationWorkflowContext` result body, so transports only ship
   * data and prompt wording stays in one place.
   */
  overview?: InitialOrchestrationWorkflowOverviewContext;
}

/**
 * OrchestrationWorkflow Context Synthetic Injector
 *
 * Injects a fake assistant(tool_call getOrchestrationWorkflowContext) + tool(result) pair after
 * the last user message, carrying the orchestration workflow-page overview as environment
 * information (same topology as {@link OnboardingSyntheticStateInjector}).
 *
 * Why a tool pair rather than appending to the user message: environment state
 * the product injects is not something the user said. As a tool result it is
 * clearly machine-provided, survives user-message rendering untouched, and
 * keeps the action→feedback shape models already handle for tool output.
 */
export class OrchestrationWorkflowContextSyntheticInjector extends BaseProcessor {
  readonly name = 'OrchestrationWorkflowContextSyntheticInjector';

  constructor(
    private config: OrchestrationWorkflowContextSyntheticInjectorConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected async doProcess(context: PipelineContext): Promise<PipelineContext> {
    if (!this.config.enabled || !this.config.overview) {
      log('Disabled or no overview, skipping');
      return this.markAsExecuted(context);
    }

    const clonedContext = this.cloneContext(context);

    let lastUserIdx = -1;
    for (let i = clonedContext.messages.length - 1; i >= 0; i--) {
      if (clonedContext.messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx === -1) {
      log('No user message found, skipping');
      return this.markAsExecuted(context);
    }

    const toolCallId = makeSyntheticToolCallId();

    const assistantMsg: Message = {
      content: '',
      id: `synthetic-assistant-orchestration-workflow-${Date.now()}`,
      role: 'assistant',
      tool_calls: [
        {
          function: {
            arguments: '{}',
            name: 'getOrchestrationWorkflowContext',
          },
          id: toolCallId,
          type: 'function',
        },
      ],
    };

    const toolMsg: Message = {
      content: buildOrchestrationWorkflowOverviewPrompt(this.config.overview),
      id: `synthetic-tool-orchestration-workflow-${Date.now()}`,
      role: 'tool',
      tool_call_id: toolCallId,
    };

    clonedContext.messages.splice(lastUserIdx + 1, 0, assistantMsg, toolMsg);

    log(
      'Injected synthetic getOrchestrationWorkflowContext pair after user message %d',
      lastUserIdx,
    );
    return this.markAsExecuted(clonedContext);
  }
}
