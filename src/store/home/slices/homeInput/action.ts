import type { StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

import { type HomeStore } from '../../store';
import { type StarterMode } from './initialState';

const n = setNamespace('homeInput');

type Setter = StoreSetter<HomeStore>;
export const createHomeInputSlice = (set: Setter, get: () => HomeStore, _api?: unknown) =>
  new HomeInputActionImpl(set, get, _api);

export class HomeInputActionImpl {
  readonly #set: Setter;

  constructor(set: Setter, _get: () => HomeStore, _api?: unknown) {
    void _api;
    this.#set = set;
    void _get;
  }

  clearInputMode = (): void => {
    this.#set({ inputActiveMode: null }, false, n('clearInputMode'));
  };

  sendAsResearch = async (message: string): Promise<void> => {
    // TODO: Implement DeepResearch mode
    console.info('sendAsResearch:', message);

    // Clear mode
    this.#set({ inputActiveMode: null }, false, n('sendAsResearch'));
  };

  setInputActiveMode = (mode: StarterMode): void => {
    this.#set({ inputActiveMode: mode }, false, n('setInputActiveMode', mode));
  };
}

export type HomeInputAction = Pick<HomeInputActionImpl, keyof HomeInputActionImpl>;
