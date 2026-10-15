/** Resolve the active owner only after the list arrives. Imports may span a
 * native host's readiness/ownership transition, including undefined -> native.
 * Invoke open synchronously after the final identity check, not after returning
 * a selection through another promise boundary. */
export async function openOwnedHistoryCompare<Owner, Item, Renderer>({
  loadItems,
  getOwner,
  loadRenderer,
  isCurrent,
  onEmpty,
  open,
}: {
  loadItems: () => Promise<Item[]>;
  getOwner: () => Owner | undefined;
  loadRenderer: (owner: Owner | undefined) => Promise<Renderer>;
  isCurrent: () => boolean;
  onEmpty: () => void;
  open: (items: Item[], renderer: Renderer) => void;
}): Promise<void> {
  const items = await loadItems();
  if (!isCurrent()) return;
  if (!items.length) {
    onEmpty();
    return;
  }
  // Bounded retries handle normal hydration/replacement without spinning if
  // the active document keeps changing while cached imports resolve.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!isCurrent()) return;
    const owner = getOwner();
    let renderer: Renderer;
    try {
      renderer = await loadRenderer(owner);
    } catch (error) {
      if (!isCurrent()) return;
      if (getOwner() !== owner) continue;
      throw error;
    }
    if (!isCurrent()) return;
    if (getOwner() !== owner) continue;
    open(items, renderer);
    return;
  }
  throw new Error('History comparison owner changed repeatedly; retry when the document is ready');
}
