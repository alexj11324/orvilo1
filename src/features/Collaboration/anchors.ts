import type { SemanticTarget } from '@/store/collaboration';

/**
 * `data-collab-id` naming + the u/v projection math from plan §9.3.
 *
 * Anchor ids are semantic, not screen positions: `task:{id}` is the card,
 * `task:{id}:{anchor}` a field inside it. Two collaborators with different
 * widths, filters, sort orders and scroll positions still resolve the same
 * object — which is why raw screen coordinates are never on the wire.
 */

const ANCHOR_NAMES = new Set(['assignee', 'card', 'delivery', 'dependencies', 'status']);

export const COLLAB_ID_ATTR = 'data-collab-id';
/** Extra ids one element also answers to (e.g. task identifier vs uuid). */
export const COLLAB_ID_ALT_ATTR = 'data-collab-id-alt';
/**
 * Marks a subtree whose anchors must never be broadcast: a collab id embeds the
 * entity id, so hovering a private task and emitting `task:{id}` would leak the
 * task's existence to every member of the room. The DOM marker stays — remote
 * cursors from legitimate viewers can still resolve — but the local publisher
 * treats the subtree as unanchored.
 */
export const COLLAB_PRIVATE_ATTR = 'data-collab-private';

export const collabIdFor = (
  entityType: 'project' | 'task' | string,
  entityId: string,
  anchor?: string,
): string =>
  anchor && anchor !== 'card' ? `${entityType}:${entityId}:${anchor}` : `${entityType}:${entityId}`;

export interface ParsedCollabId {
  anchor?: string;
  entityId: string;
  entityType: string;
}

/**
 * `task:{id}` / `task:{id}:{anchor}` → parts. The anchor is only recognised
 * when the trailing segment is a known field name, so an entity id containing
 * a colon still parses (middle segments stay glued back into the id).
 */
export const parseCollabId = (collabId: string): ParsedCollabId | null => {
  const parts = collabId.split(':');
  if (parts.length < 2) return null;

  const entityType = parts[0];
  if (!entityType) return null;

  const last = parts.at(-1);
  if (parts.length > 2 && last !== undefined && ANCHOR_NAMES.has(last)) {
    return { anchor: last, entityId: parts.slice(1, -1).join(':'), entityType };
  }
  return { entityId: parts.slice(1).join(':'), entityType };
};

/** collab id for an activity target; 'card' collapses to the bare entity id. */
export const collabIdForTarget = (target: SemanticTarget): string =>
  collabIdFor(target.entityType, target.entityId, target.anchor);

export interface RectLike {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * Project a normalised (u,v) inside `targetRect` into the overlay's own
 * coordinate space (plan §9.3). For a fixed-position overlay `overlayRect` is
 * the viewport origin {0,0}; an overlay inside scrolling content passes its
 * own rect so the two stay in one coordinate system.
 */
export const anchorPointInOverlay = (
  targetRect: RectLike,
  u: number,
  v: number,
  overlayRect: Pick<RectLike, 'left' | 'top'> = { left: 0, top: 0 },
): { x: number; y: number } => ({
  x: targetRect.left - overlayRect.left + u * targetRect.width,
  y: targetRect.top - overlayRect.top + v * targetRect.height,
});

/**
 * The inverse of `anchorPointInOverlay` — local pointer position → normalised
 * (u,v). `u`/`v` are clamped to [0,1] so a pointer straying a few px outside a
 * card still anchors to its edge instead of producing nonsense positions.
 */
export const pointToUV = (
  point: { x: number; y: number },
  targetRect: RectLike,
): { u: number; v: number } => {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    u: targetRect.width === 0 ? 0 : clamp((point.x - targetRect.left) / targetRect.width),
    v: targetRect.height === 0 ? 0 : clamp((point.y - targetRect.top) / targetRect.height),
  };
};

/**
 * Pointer → anchor resolution for the cursor publisher. Returns the enclosing
 * collab element + its id, or null when the pointer is over nothing anchored —
 * including anything inside a `data-collab-private` subtree, which must never
 * reach the wire (see the attribute's doc above).
 */
export const collabAnchorFor = (
  target: EventTarget | null,
): { anchorEl: Element; collabId: string } | null => {
  const el = target instanceof Element ? target : null;
  const anchorEl = el?.closest(`[${COLLAB_ID_ATTR}]`) ?? null;
  if (!anchorEl || anchorEl.closest(`[${COLLAB_PRIVATE_ATTR}]`)) return null;
  const collabId = anchorEl.getAttribute(COLLAB_ID_ATTR);
  return collabId ? { anchorEl, collabId } : null;
};
