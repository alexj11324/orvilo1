import type { BuiltinToolManifest } from '@orvilo/types';

import { systemPrompt } from './systemRole';
import { OrchestrationWorkflowApiName } from './types';

export const OrchestrationWorkflowIdentifier = 'orvilo-orchestration-workflow';

export const OrchestrationWorkflowManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        "Create a parent Issue and its sub-Issues in Backlog, post the complete split in this conversation, and await the person's reply. No execution or intake is permitted until a later user reply releases the split. Questions stay in conversation.",
      humanIntervention: 'never',
      name: OrchestrationWorkflowApiName.prepareOrchestrationWorkflow,
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
                title: { type: 'string' },
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
          tasks: {
            description:
              'Ordered sub-Issues with distinct outcome titles, scope, exclusions and checkable acceptance criteria. Dependency indices are zero-based and refer to earlier entries.',
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                assigneeAgentId: { type: 'string' },
                reviewerAgentId: { type: 'string' },
                dependsOn: { type: 'array', items: { type: 'integer', minimum: 0 } },
              },
              required: ['title', 'description'],
            },
          },
        },
        required: ['name', 'instruction', 'criteria', 'tasks'],
        type: 'object',
      },
      renderDisplayControl: 'expand',
    },
    {
      name: OrchestrationWorkflowApiName.postOrchestrationWorkflowPlan,
      description:
        'After editing or deleting the pending Backlog Issues, post the revised split and ask for another reply. Resets the server reply boundary; cannot modify a released split.',
      humanIntervention: 'never',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { orchestrationWorkflowId: { type: 'string' } },
        required: ['orchestrationWorkflowId'],
      },
    },
    {
      name: OrchestrationWorkflowApiName.startOrchestrationWorkflow,
      description:
        'Release the existing split after the person confirms it in this conversation. The server requires the current turn to originate from a user message later than the posted split. Never call on a change request; edit the Backlog Issues and post the revised split instead. No Start or confirmation button is used.',
      humanIntervention: 'never',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { orchestrationWorkflowId: { type: 'string' } },
        required: ['orchestrationWorkflowId'],
      },
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
