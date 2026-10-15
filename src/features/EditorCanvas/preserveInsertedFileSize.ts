import type { ElementNode, LexicalNode } from 'lexical';
import { $getRoot, $getSelection, $isElementNode, $isRangeSelection } from 'lexical';

interface FileNodeWithSize {
  __size?: number;
  getWritable: () => FileNodeWithSize;
  name: string;
  size?: number;
  status?: 'pending' | 'uploaded' | 'error';
}

const getChildren = (node: LexicalNode): LexicalNode[] =>
  'getChildren' in node ? (node as ElementNode).getChildren() : [];

/**
 * The editor's file command currently creates its node with only the filename.
 * It invokes the upload handler from the same Lexical update, so persist the
 * source File size on that newly inserted pending node before the upload starts.
 */
export const preservePendingFileNodeSize = (root: LexicalNode, file: File): boolean => {
  const pending: LexicalNode[] = [root];

  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;

    if (node.getType() === 'file') {
      const fileNode = node as unknown as FileNodeWithSize;
      if (
        fileNode.name === file.name &&
        fileNode.status === 'pending' &&
        fileNode.size === undefined
      ) {
        fileNode.getWritable().__size = file.size;
        return true;
      }
    }
    pending.push(...getChildren(node));
  }

  return false;
};

export const preserveInsertedFileSize = (file: File): void => {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const anchorNode = selection.anchor.getNode();
    const candidate = $isElementNode(anchorNode)
      ? anchorNode.getChildAtIndex(selection.anchor.offset - 1)
      : anchorNode.getPreviousSibling();
    if (candidate && preservePendingFileNodeSize(candidate, file)) return;
  }

  preservePendingFileNodeSize($getRoot(), file);
};
