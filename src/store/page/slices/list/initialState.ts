import { type OrviloDocument } from '@/types/document';

import { type PageQueryFilter } from '../../initialState';

export interface ListState {
  currentPage: number;
  documents: OrviloDocument[];
  documentsTotal: number;
  hasMoreDocuments: boolean;
  isDocumentListLoading: boolean;
  isLoadingMoreDocuments: boolean;
  localPageMap: Map<string, OrviloDocument>;
  queryFilter?: PageQueryFilter;
  searchKeywords: string;
  showOnlyPagesNotInLibrary: boolean;
}

export const initialListState: ListState = {
  currentPage: 0,
  documents: [],
  documentsTotal: 0,
  hasMoreDocuments: false,
  isDocumentListLoading: false,
  isLoadingMoreDocuments: false,
  localPageMap: new Map(),
  queryFilter: undefined,
  searchKeywords: '',
  showOnlyPagesNotInLibrary: false,
};
