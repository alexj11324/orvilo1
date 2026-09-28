import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { type StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { expose } from '../middleware/expose';
import { flattenActions } from '../utils/flattenActions';
import { type ResetableStore, ResetableStoreAction } from '../utils/resetableStore';
import { type MCPAction } from './slices/mcp';
import { createMCPSlice } from './slices/mcp';
import { type PluginAction } from './slices/plugin/action';
import { createPluginSlice } from './slices/plugin/action';

//  ===============  Aggregate createStoreFn ============ //

export type DiscoverStore = MCPAction & PluginAction & ResetableStore;

type DiscoverStoreAction = MCPAction & PluginAction & ResetableStore;

class DiscoverStoreResetAction extends ResetableStoreAction<DiscoverStore> {
  protected readonly resetActionName = 'resetDiscoverStore';
}

const createStore: StateCreator<DiscoverStore, [['zustand/devtools', never]]> = (
  ...parameters: Parameters<StateCreator<DiscoverStore, [['zustand/devtools', never]]>>
) =>
  flattenActions<DiscoverStoreAction>([
    createMCPSlice(...parameters),
    createPluginSlice(...parameters),
    new DiscoverStoreResetAction(...parameters),
  ]);

//  ===============  Implement useStore ============ //

const devtools = createDevtools('discover');

export const useDiscoverStore = createWithEqualityFn<DiscoverStore>()(
  devtools(createStore),
  shallow,
);

expose('discover', useDiscoverStore);

export const getDiscoverStoreState = () => useDiscoverStore.getState();
