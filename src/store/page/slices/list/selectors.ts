import { useGlobalStore } from '@/store/global';
import { type OrviloDocument } from '@/types/document';

import { type PageState } from '../../initialState';

/**
 * Check if documents are still loading (undefined means not yet loaded)
 */
const isDocumentsLoading = (s: PageState): boolean => s.documents === undefined;

const getFilteredDocuments = (s: PageState): OrviloDocument[] => {
  const docs = s.documents ?? [];

  const { searchKeywords, showOnlyPagesNotInLibrary } = s;

  let result = docs;

  // Filter out documents with sourceType='file'
  result = result.filter((doc: OrviloDocument) => doc.sourceType !== 'file');

  // Filter by library membership
  if (showOnlyPagesNotInLibrary) {
    result = result.filter((doc: OrviloDocument) => {
      // Show only pages that are NOT in any library
      // Pages in a library have metadata.knowledgeBaseId set
      return !doc.metadata?.knowledgeBaseId;
    });
  }

  // Filter by search keywords
  if (searchKeywords.trim()) {
    const lowerKeywords = searchKeywords.toLowerCase();
    result = result.filter((doc: OrviloDocument) => {
      const content = doc.content?.toLowerCase() || '';
      const title = doc.title?.toLowerCase() || '';
      return content.includes(lowerKeywords) || title.includes(lowerKeywords);
    });
  }

  // Sort by creation date (newest first)
  return result.sort((a: OrviloDocument, b: OrviloDocument) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
};

// Limited filtered documents for sidebar display
const getFilteredDocumentsLimited = (s: PageState): OrviloDocument[] => {
  const pageSize = useGlobalStore.getState().status.pagePageSize || 20;
  const allDocs = getFilteredDocuments(s);
  return allDocs.slice(0, pageSize);
};

// Workspace-mode sidebar buckets: split filtered docs into "private" (creator
// only) and "workspace-shared". Personal-mode `visibility` is meaningless — the
// caller decides whether to render the flat list or the dual accordion.
const getPrivateFilteredDocuments = (s: PageState): OrviloDocument[] =>
  getFilteredDocuments(s).filter((doc) => doc.visibility === 'private');

const getWorkspaceFilteredDocuments = (s: PageState): OrviloDocument[] =>
  getFilteredDocuments(s).filter((doc) => doc.visibility !== 'private');

// Bucket-scoped, sidebar-sized page slices — mirror the Limited helper for the
// dual-accordion Pages sidebar so each bucket paginates independently.
const getPrivateFilteredDocumentsLimited = (s: PageState): OrviloDocument[] => {
  const pageSize = useGlobalStore.getState().status.pagePageSize || 20;
  return getPrivateFilteredDocuments(s).slice(0, pageSize);
};

const getWorkspaceFilteredDocumentsLimited = (s: PageState): OrviloDocument[] => {
  const pageSize = useGlobalStore.getState().status.pagePageSize || 20;
  return getWorkspaceFilteredDocuments(s).slice(0, pageSize);
};

const privateFilteredDocumentsCount = (s: PageState): number =>
  getPrivateFilteredDocuments(s).length;

const workspaceFilteredDocumentsCount = (s: PageState): number =>
  getWorkspaceFilteredDocuments(s).length;

const hasMorePrivateFilteredDocuments = (s: PageState): boolean => {
  const pageSize = useGlobalStore.getState().status.pagePageSize || 20;
  return getPrivateFilteredDocuments(s).length > pageSize;
};

const hasMoreWorkspaceFilteredDocuments = (s: PageState): boolean => {
  const pageSize = useGlobalStore.getState().status.pagePageSize || 20;
  return getWorkspaceFilteredDocuments(s).length > pageSize;
};

const getDocumentById = (docId: string | undefined) => (s: PageState) => {
  if (!docId) return undefined;

  // Find in documents array
  return s.documents?.find((doc) => doc.id === docId);
};

const hasMoreDocuments = (s: PageState): boolean => s.hasMoreDocuments;

const isLoadingMoreDocuments = (s: PageState): boolean => s.isLoadingMoreDocuments;

const documentsTotal = (s: PageState): number => s.documentsTotal;

// Check if filtered documents have more than displayed
const hasMoreFilteredDocuments = (s: PageState): boolean => {
  const pageSize = useGlobalStore.getState().status.pagePageSize || 20;
  const allDocs = getFilteredDocuments(s);
  return allDocs.length > pageSize;
};

// Get total count of filtered documents
const filteredDocumentsCount = (s: PageState): number => {
  return getFilteredDocuments(s).length;
};

export const listSelectors = {
  documentsTotal,
  filteredDocumentsCount,
  getDocumentById,
  getFilteredDocuments,
  getFilteredDocumentsLimited,
  getPrivateFilteredDocuments,
  getPrivateFilteredDocumentsLimited,
  getWorkspaceFilteredDocuments,
  getWorkspaceFilteredDocumentsLimited,
  hasMoreDocuments,
  hasMoreFilteredDocuments,
  hasMorePrivateFilteredDocuments,
  hasMoreWorkspaceFilteredDocuments,
  isDocumentsLoading,
  isLoadingMoreDocuments,
  privateFilteredDocumentsCount,
  workspaceFilteredDocumentsCount,
};
