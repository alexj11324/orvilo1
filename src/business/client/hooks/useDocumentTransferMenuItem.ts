import type { ItemType } from '@/components/Menu';

export interface DocumentTransferMenuItemOptions {
  defaultTargetVisibility?: 'private' | 'public';
  preferCurrentWorkspace?: boolean;
  transferLabel?: string;
}

export const useDocumentTransferMenuItem = (
  _documentId?: string,
  _options?: DocumentTransferMenuItemOptions,
): ItemType[] | null => null;
