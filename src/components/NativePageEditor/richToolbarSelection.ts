import {
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type LexicalEditor,
  type RangeSelection,
} from 'lexical';

/** Run only within the current editor read/update transaction. Saved points
 * belong to a previous immutable state and must never resolve via getNode(). */
function $validPoint(point: RangeSelection['anchor']): boolean {
  const node = $getNodeByKey(point.key);
  if (!node?.isAttached() || !Number.isInteger(point.offset) || point.offset < 0) return false;
  if (point.type === 'text') return $isTextNode(node) && point.offset <= node.getTextContentSize();
  return point.type === 'element' && $isElementNode(node) && point.offset <= node.getChildrenSize();
}
function $validRange(selection: RangeSelection): boolean {
  return $validPoint(selection.anchor) && $validPoint(selection.focus);
}
export function $captureNativeToolbarSelection(): RangeSelection | null {
  const selection = $getSelection();
  return $isRangeSelection(selection) && $validRange(selection) ? selection.clone() : null;
}

/** A valid saved range restores focus lost to the toolbar. After clean/reset,
 * only an actual valid current range may be used; otherwise the action is a
 * no-op. A stale point is never installed into the new document. */
export function applyNativeToolbarAction(
  editor: LexicalEditor,
  saved: RangeSelection | null,
  action: () => void,
): boolean {
  if (!editor.isEditable()) return false;
  let applied = false;
  editor.update(
    () => {
      if (!editor.isEditable()) return;
      if (saved && $validRange(saved)) $setSelection(saved.clone());
      else if (!$captureNativeToolbarSelection()) return;
      action();
      applied = true;
    },
    { discrete: true },
  );
  return applied;
}
