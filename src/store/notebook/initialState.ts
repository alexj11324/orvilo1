import { type NotebookDocument } from '@orvilo/types';

export interface NotebookState {
  /**
   * Map of topicId -> notebook documents list
   */
  notebookMap: Record<string, NotebookDocument[]>;
}

export const initialNotebookState: NotebookState = {
  notebookMap: {},
};
