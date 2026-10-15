import type { DocumentEditorPort } from '@/store/document/types';

interface ExportDocumentState {
  activeDocumentId?: string;
  editor?: Pick<DocumentEditorPort, 'getDocument'> | null;
}

/** Read at action time: an open popup may outlive its document owner. Empty
 * Markdown is a valid export; an unavailable or different owner is not. */
export function readOwnedMarkdownForExport(
  documentId: string,
  getState: () => ExportDocumentState,
): string | undefined {
  const state = getState();
  if (state.activeDocumentId !== documentId || !state.editor) return undefined;
  const markdown = state.editor.getDocument('markdown');
  if (typeof markdown !== 'string') throw new Error('Markdown export unavailable');
  return markdown;
}
