import { AskUserQuestionRender } from '@orvilo/builtin-tool-user-interaction/client';

import { OrviloAgentApiName } from '../../types';
import CallSubAgentRender from './CallSubAgent';
import CreatePlan from './CreatePlan';
import TodoListRender from './TodoList';

/**
 * Orvilo Agent Tool Render Components Registry
 *
 * Sub-agent dispatch operations render a card showing the dispatched
 * task(s). Plan operations render the PlanCard UI. Todo operations
 * share a single TodoList render.
 */
export const OrviloAgentRenders = {
  [OrviloAgentApiName.askUserQuestion]: AskUserQuestionRender,
  [OrviloAgentApiName.callSubAgent]: CallSubAgentRender,

  // Plan operations render the PlanCard UI
  [OrviloAgentApiName.createPlan]: CreatePlan,
  [OrviloAgentApiName.updatePlan]: CreatePlan,

  // All todo operations render the same TodoList UI
  [OrviloAgentApiName.clearTodos]: TodoListRender,
  [OrviloAgentApiName.createTodos]: TodoListRender,
  [OrviloAgentApiName.updateTodos]: TodoListRender,
};

export { default as CallSubAgentRender } from './CallSubAgent';
export { default as CreatePlan, PlanCard } from './CreatePlan';
export type { TodoListRenderState } from './TodoList';
export { default as TodoListRender, TodoListUI } from './TodoList';
