import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { type StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { expose } from '../middleware/expose';
import { type StoreSetter } from '../types';
import { flattenActions } from '../utils/flattenActions';
import { type ResetableStore } from '../utils/resetableStore';
import { type CollaborationAction, createCollaborationSlice } from './action';
import { type CollaborationState, initialCollaborationState } from './initialState';

export type CollaborationStore = CollaborationState & CollaborationAction & ResetableStore;

class CollaborationStoreResetAction implements ResetableStore {
  readonly #set: StoreSetter<CollaborationStore>;

  constructor(
    set: StoreSetter<CollaborationStore>,
    _get: () => CollaborationStore,
    _api?: unknown,
  ) {
    void _get;
    void _api;
    this.#set = set;
  }

  reset = () => {
    this.#set({ rooms: {} }, false, 'resetCollaborationStore');
  };
}

const createStore: StateCreator<CollaborationStore, [['zustand/devtools', never]]> = (
  ...parameters
) => ({
  ...initialCollaborationState,
  ...flattenActions<CollaborationAction & ResetableStore>([
    createCollaborationSlice(...parameters),
    new CollaborationStoreResetAction(...parameters),
  ]),
});

const devtools = createDevtools('collaboration');

/**
 * Ephemeral presence only — no persistence middleware on purpose. Room state
 * rebuilds from the gateway snapshot on every connect; stale cursors are
 * never replayed (contract §8.1).
 */
export const useCollaborationStore = createWithEqualityFn<CollaborationStore>()(
  devtools(createStore),
  shallow,
);

expose('collaboration', useCollaborationStore);

export const getCollaborationStoreState = () => useCollaborationStore.getState();
