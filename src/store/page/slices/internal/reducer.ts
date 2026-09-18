import { produce } from 'immer';

import { type OrviloDocument } from '@/types/document';

// ============ Action Types ============

type AddDocumentAction = {
  document: OrviloDocument;
  type: 'addDocument';
};

type RemoveDocumentAction = {
  id: string;
  type: 'removeDocument';
};

type UpdateDocumentAction = {
  document: OrviloDocument;
  id: string;
  type: 'updateDocument';
};

type ReplaceDocumentAction = {
  document: OrviloDocument;
  oldId: string;
  type: 'replaceDocument';
};

type SetDocumentsAction = {
  documents: OrviloDocument[];
  type: 'setDocuments';
};

type AppendDocumentsAction = {
  documents: OrviloDocument[];
  type: 'appendDocuments';
};

export type DocumentsDispatch =
  | AddDocumentAction
  | RemoveDocumentAction
  | UpdateDocumentAction
  | ReplaceDocumentAction
  | SetDocumentsAction
  | AppendDocumentsAction;

// ============ Reducer ============

export const documentsReducer = (
  state: OrviloDocument[] | undefined,
  payload: DocumentsDispatch,
): OrviloDocument[] | undefined => {
  switch (payload.type) {
    case 'addDocument': {
      return produce(state ?? [], (draft) => {
        // Add to the beginning
        draft.unshift(payload.document);
      });
    }

    case 'removeDocument': {
      if (!state) return state;
      return produce(state, (draft) => {
        const index = draft.findIndex((doc) => doc.id === payload.id);
        if (index !== -1) {
          draft.splice(index, 1);
        }
      });
    }

    case 'updateDocument': {
      if (!state) return state;
      return produce(state, (draft) => {
        const index = draft.findIndex((doc) => doc.id === payload.id);
        if (index !== -1) {
          draft[index] = payload.document;
        }
      });
    }

    case 'replaceDocument': {
      if (!state) return [payload.document];
      return produce(state, (draft) => {
        const index = draft.findIndex((doc) => doc.id === payload.oldId);
        if (index !== -1) {
          draft[index] = payload.document;
        }
      });
    }

    case 'setDocuments': {
      return payload.documents;
    }

    case 'appendDocuments': {
      return produce(state ?? [], (draft) => {
        draft.push(...payload.documents);
      });
    }

    default: {
      return state;
    }
  }
};
