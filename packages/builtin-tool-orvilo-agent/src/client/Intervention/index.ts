import { AskUserQuestionIntervention } from '@orvilo/builtin-tool-user-interaction/client';
import type { BuiltinIntervention } from '@orvilo/types';

import { OrviloAgentApiName } from '../../types';
import AddTodoIntervention from './AddTodo';
import ClearTodosIntervention from './ClearTodos';
import CreatePlanIntervention from './CreatePlan';

/**
 * Orvilo Agent Intervention Components Registry
 *
 * Intervention components allow users to review and modify tool parameters
 * before the tool is executed.
 *
 * `askUserQuestion` reuses the standalone user-interaction card: it renders as
 * an inline custom form (not the default approve/reject) — see
 * `isCustomInteractionIdentifier` in customInteractionHandlers.
 */
export const OrviloAgentInterventions: Record<string, BuiltinIntervention> = {
  [OrviloAgentApiName.askUserQuestion]: AskUserQuestionIntervention as BuiltinIntervention,
  [OrviloAgentApiName.clearTodos]: ClearTodosIntervention as BuiltinIntervention,
  [OrviloAgentApiName.createPlan]: CreatePlanIntervention as BuiltinIntervention,
  [OrviloAgentApiName.createTodos]: AddTodoIntervention as BuiltinIntervention,
};

export { default as AddTodoIntervention } from './AddTodo';
export { default as ClearTodosIntervention } from './ClearTodos';
export { default as CreatePlanIntervention } from './CreatePlan';
