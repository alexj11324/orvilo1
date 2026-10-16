import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { type StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { expose } from '../middleware/expose';
import { flattenActions } from '../utils/flattenActions';
import { type ResetableStore, ResetableStoreAction } from '../utils/resetableStore';
import { initialState, type ToolStoreState } from './initialState';
import {
  type AgentDocumentSkillsAction,
  createAgentDocumentSkillsSlice,
} from './slices/agentDocumentSkills';
import { type AgentSkillsAction, createAgentSkillsSlice } from './slices/agentSkills';
import { type BuiltinToolAction, createBuiltinToolSlice } from './slices/builtin';
import { type ConnectorAction, createConnectorSlice } from './slices/connector';
import { createPluginSlice, type PluginAction } from './slices/plugin';

//  ===============  Aggregate createStoreFn ============ //

export type ToolStore = ToolStoreState &
  ConnectorAction &
  PluginAction &
  BuiltinToolAction &
  AgentSkillsAction &
  AgentDocumentSkillsAction &
  ResetableStore;

type ToolStoreAction = ConnectorAction &
  PluginAction &
  BuiltinToolAction &
  AgentSkillsAction &
  AgentDocumentSkillsAction &
  ResetableStore;

class ToolStoreResetAction extends ResetableStoreAction<ToolStore> {
  protected readonly resetActionName = 'resetToolStore';
}

const createStore: StateCreator<ToolStore, [['zustand/devtools', never]]> = (
  ...parameters: Parameters<StateCreator<ToolStore, [['zustand/devtools', never]]>>
) => ({
  ...initialState,
  ...flattenActions<ToolStoreAction>([
    createConnectorSlice(...parameters),
    createPluginSlice(...parameters),
    createBuiltinToolSlice(...parameters),
    createAgentSkillsSlice(...parameters),
    createAgentDocumentSkillsSlice(...parameters),
    new ToolStoreResetAction(...parameters),
  ]),
});

//  ===============  Implement useStore ============ //

const devtools = createDevtools('tools');

export const useToolStore = createWithEqualityFn<ToolStore>()(devtools(createStore), shallow);

expose('tool', useToolStore);

export const getToolStoreState = () => useToolStore.getState();
