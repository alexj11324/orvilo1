import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { type StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { expose } from '../middleware/expose';
import { flattenActions } from '../utils/flattenActions';
import { type AiInfraAction } from './action';
import { createAiInfraSlice } from './action';
import { type AIProviderStoreState } from './initialState';
import { initialState } from './initialState';

//  ===============  Aggregate createStoreFn ============ //

export interface AiInfraStore extends AIProviderStoreState, AiInfraAction {
  /* empty */
}

const createStore: StateCreator<AiInfraStore, [['zustand/devtools', never]]> = (
  ...parameters: Parameters<StateCreator<AiInfraStore, [['zustand/devtools', never]]>>
) => ({
  ...initialState,
  ...flattenActions<AiInfraAction>([createAiInfraSlice(...parameters)]),
});

//  ===============  Implement useStore ============ //
const devtools = createDevtools('aiInfra');

export const useAiInfraStore = createWithEqualityFn<AiInfraStore>()(devtools(createStore), shallow);

expose('aiInfra', useAiInfraStore);

export const getAiInfraStoreState = () => useAiInfraStore.getState();
