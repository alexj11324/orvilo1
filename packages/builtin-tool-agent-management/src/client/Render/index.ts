import { AgentManagementApiName } from '../../types';
import CallAgentRender from './CallAgent';
import CreateAgentRender from './CreateAgent';
import DuplicateAgentRender from './DuplicateAgent';
import GetAgentDetailRender from './GetAgentDetail';
import SearchAgentRender from './SearchAgent';
import UpdateAgentRender from './UpdateAgent';
import UpdatePromptRender from './UpdatePrompt';

/**
 * Agent Management Tool Render Components Registry
 */
export const AgentManagementRenders = {
  [AgentManagementApiName.callAgent]: CallAgentRender,
  [AgentManagementApiName.createAgent]: CreateAgentRender,
  [AgentManagementApiName.duplicateAgent]: DuplicateAgentRender,
  [AgentManagementApiName.getAgentDetail]: GetAgentDetailRender,
  [AgentManagementApiName.searchAgent]: SearchAgentRender,
  [AgentManagementApiName.updateAgent]: UpdateAgentRender,
  [AgentManagementApiName.updatePrompt]: UpdatePromptRender,
};

export { default as CallAgentRender } from './CallAgent';
export { default as CreateAgentRender } from './CreateAgent';
export { default as DuplicateAgentRender } from './DuplicateAgent';
export { default as GetAgentDetailRender } from './GetAgentDetail';
export { default as SearchAgentRender } from './SearchAgent';
export { default as UpdateAgentRender } from './UpdateAgent';
export { default as UpdatePromptRender } from './UpdatePrompt';
