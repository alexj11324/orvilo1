import type { BuiltinToolManifest } from '@orvilo/types';

import { systemPrompt } from './systemRole';
import { OrchestrationWorkflowApiName } from './types';

export const OrchestrationWorkflowIdentifier = 'orvilo-orchestration-workflow';

export const OrchestrationWorkflowManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Propose an orchestration workflow for work the workspace Orchestrator judges should be delivered through Issues. Present the full plan for human confirmation; nothing is created or dispatched until approval. Questions and quick replies stay in the conversation. After a confirmed start, the coordinator owns execution; do not perform the work in this conversation.',
      humanIntervention: 'always',
      name: OrchestrationWorkflowApiName.startOrchestrationWorkflow,
      parameters: {
        additionalProperties: false,
        properties: {
          criteria: {
            description:
              'Concrete acceptance criteria derived from every explicit user requirement.',
            items: {
              additionalProperties: false,
              properties: {
                description: { type: 'string' },
                instruction: {
                  description: 'Detailed judging instruction. Omit for program checks.',
                  type: 'string',
                },
                onFail: { enum: ['auto_repair', 'manual'], type: 'string' },
                required: { type: 'boolean' },
                title: { type: 'string' },
                verifierConfig: { type: 'object' },
                verifierType: { enum: ['agent', 'llm', 'program'], type: 'string' },
              },
              required: ['title'],
              type: 'object',
            },
            type: 'array',
          },
          deadline: {
            description:
              'Optional ISO-8601 calendar deadline. Past it the coordinator stops dispatching new work and pauses the orchestration workflow — use for long-horizon orchestration workflows that must conclude by a date. Null means no user-specified deadline.',
            type: ['string', 'null'],
          },
          instruction: { description: 'Detailed task direction and constraints.', type: 'string' },
          maxConcurrentTasks: {
            description:
              "How many of the orchestration workflow's tasks may run at once (1-10). Lower serializes the work for less spend pressure; higher fans out independent tasks. Null means the coordinator default.",
            type: ['number', 'null'],
          },
          maxIterations: {
            description:
              'Maximum attempts one task may take before the orchestration workflow opens a decision gate. Default 3, minimum 2. Null means no user-specified cap.',
            type: ['number', 'null'],
          },
          maxTotalCost: {
            description: 'Optional total USD budget. Null means no user-specified cap.',
            type: ['number', 'null'],
          },
          name: { description: 'Short orchestration workflow title.', type: 'string' },
        },
        required: ['name', 'instruction', 'criteria'],
        type: 'object',
      },
      renderDisplayControl: 'expand',
    },
  ],
  identifier: OrchestrationWorkflowIdentifier,
  meta: {
    avatar: '🎯',
    description: 'Plan and start orchestration workflows with editable acceptance criteria',
    title: 'OrchestrationWorkflow',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
