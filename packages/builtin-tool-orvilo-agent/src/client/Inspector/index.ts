import { AskUserQuestionInspector } from '@orvilo/builtin-tool-user-interaction/client';
import type { BuiltinInspector } from '@orvilo/types';

import { OrviloAgentApiName } from '../../types';
import { AnalyzeMediaInspector } from './AnalyzeMedia';
import { CallSubAgentInspector } from './CallSubAgent';
import { ClearTodosInspector } from './ClearTodos';
import { CreatePlanInspector } from './CreatePlan';
import { CreateTodosInspector } from './CreateTodos';
import { UpdatePlanInspector } from './UpdatePlan';
import { UpdateTodosInspector } from './UpdateTodos';
import { VentInspector } from './Vent';

/**
 * Orvilo Agent Inspector Components Registry
 *
 * Inspector components customize the title/header area
 * of tool calls in the conversation UI.
 */
export const OrviloAgentInspectors: Record<string, BuiltinInspector> = {
  [OrviloAgentApiName.analyzeMedia]: AnalyzeMediaInspector as BuiltinInspector,
  [OrviloAgentApiName.askUserQuestion]: AskUserQuestionInspector as BuiltinInspector,
  [OrviloAgentApiName.callSubAgent]: CallSubAgentInspector as BuiltinInspector,
  [OrviloAgentApiName.clearTodos]: ClearTodosInspector as BuiltinInspector,
  [OrviloAgentApiName.createPlan]: CreatePlanInspector as BuiltinInspector,
  [OrviloAgentApiName.createTodos]: CreateTodosInspector as BuiltinInspector,
  [OrviloAgentApiName.updatePlan]: UpdatePlanInspector as BuiltinInspector,
  [OrviloAgentApiName.updateTodos]: UpdateTodosInspector as BuiltinInspector,
  [OrviloAgentApiName.vent]: VentInspector as BuiltinInspector,
};
