import { type StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

import { type PageStore } from '../../store';

const n = setNamespace('page/selection');

type Setter = StoreSetter<PageStore>;
export const createSelectionSlice = (set: Setter, get: () => PageStore, _api?: unknown) =>
  new SelectionActionImpl(set, get, _api);

export class SelectionActionImpl {
  readonly #get: () => PageStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => PageStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  closeAllPagesDrawer = (): void => {
    this.#set({ allPagesDrawerOpen: false }, false, n('closeAllPagesDrawer'));
  };

  openAllPagesDrawer = (): void => {
    this.#set({ allPagesDrawerOpen: true }, false, n('openAllPagesDrawer'));
  };

  selectPage = (pageId: string): void => {
    const { selectedPageId } = this.#get();

    // Don't allow deselecting the current page
    if (selectedPageId === pageId) return;

    // Select the document for the current editor surface.
    this.#set({ isCreatingNew: false, selectedPageId: pageId }, false, n('selectPage'));
  };

  setRenamingPageId = (pageId: string | null): void => {
    this.#set({ renamingPageId: pageId }, false, n('setRenamingPageId'));
  };

  setSelectedPageId = (pageId: string | null, _shouldNavigate: boolean = true): void => {
    this.#set({ selectedPageId: pageId }, false, n('setSelectedPageId'));
  };
}

export type SelectionAction = Pick<SelectionActionImpl, keyof SelectionActionImpl>;
