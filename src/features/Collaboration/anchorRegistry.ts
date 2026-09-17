import { COLLAB_ID_ALT_ATTR, COLLAB_ID_ATTR, type RectLike } from './anchors';

/**
 * DOM-side half of the semantic-anchor model. Tracks which collab ids exist
 * in the document and hands out their live rects.
 *
 * Invalidation is event-driven, not polled: `getRect` reads
 * `getBoundingClientRect` at call time so scroll/resize never needs a scan —
 * only the *existence* map does, and that's maintained by a MutationObserver.
 * A `version` counter bumps whenever membership changes so subscribers can
 * re-render once per DOM change, not per pointermove.
 */
export class AnchorRegistry {
  /** Map from collab id to elements (usually one; mirrors share the id). */
  #elements = new Map<string, Set<Element>>();
  #listeners = new Set<() => void>();
  #observer?: MutationObserver;
  #root?: ParentNode;
  /** Membership version — bump on any id-set change. */
  version = 0;

  attach(root: ParentNode): () => void {
    this.detach();
    this.#root = root;
    this.#rescan();

    this.#observer = new MutationObserver(() => this.#rescan());
    const target =
      'body' in root && (root as Document).body ? (root as Document).body : (root as Node);
    this.#observer.observe(target as Node, {
      attributeFilter: [COLLAB_ID_ATTR, COLLAB_ID_ALT_ATTR],
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => this.detach();
  }

  detach(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#root = undefined;
    if (this.#elements.size > 0) {
      this.#elements.clear();
      this.#bump();
    }
  }

  /** Elements carrying this collab id (empty when unmounted/filtered out). */
  elementsFor(collabId: string): readonly Element[] {
    return [...(this.#elements.get(collabId) ?? [])];
  }

  /** Whether the anchor currently exists in the DOM. */
  has(collabId: string): boolean {
    return (this.#elements.get(collabId)?.size ?? 0) > 0;
  }

  /** Live viewport rect of the first element for this id, or null. */
  getRect(collabId: string): RectLike | null {
    const el = this.#elements.get(collabId)?.values().next().value;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
  }

  /** getSnapshot for useSyncExternalStore. */
  getVersion = (): number => this.version;

  /** Subscribe to membership changes; returns an unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #add(id: string, el: Element, into: Map<string, Set<Element>>): void {
    if (!id) return;
    let set = into.get(id);
    if (!set) {
      set = new Set();
      into.set(id, set);
    }
    set.add(el);
  }

  #rescan(): void {
    const next = new Map<string, Set<Element>>();
    const scope = this.#root;
    if (scope) {
      const found = scope.querySelectorAll(`[${COLLAB_ID_ATTR}], [${COLLAB_ID_ALT_ATTR}]`);
      for (const el of found) {
        const primary = el.getAttribute(COLLAB_ID_ATTR);
        if (primary) this.#add(primary, el, next);
        const alt = el.getAttribute(COLLAB_ID_ALT_ATTR);
        if (alt) {
          for (const id of alt.split(' ')) this.#add(id, el, next);
        }
      }
    }

    if (sameMembership(this.#elements, next)) {
      this.#elements = next;
      return;
    }
    this.#elements = next;
    this.#bump();
  }

  #bump(): void {
    this.version += 1;
    for (const listener of this.#listeners) listener();
  }
}

const sameMembership = (a: Map<string, Set<Element>>, b: Map<string, Set<Element>>): boolean => {
  if (a.size !== b.size) return false;
  for (const [key, aSet] of a) {
    const bSet = b.get(key);
    if (!bSet || aSet.size !== bSet.size) return false;
    for (const el of aSet) {
      if (!bSet.has(el)) return false;
    }
  }
  return true;
};
