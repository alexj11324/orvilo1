/**
 * Label chip colour helpers.
 *
 * Linear draws every label chip as a coloured dot plus the label name. The
 * Orvilo `project_labels` schema stores only a name — no colour column — so
 * the dot colour is derived deterministically from the name. The same label
 * therefore paints the same colour on every surface (rows, properties,
 * pickers) and for every member, which is what a shared workspace taxonomy
 * needs. When a caller does carry an explicit colour (e.g. agent labels have
 * a `color` column) it wins via `resolveLabelColor`.
 *
 * The palette mirrors Linear's label hues: saturated mid-tones that stay
 * legible at a 6px dot against both light and dark surfaces.
 */
export const LABEL_DOT_PALETTE = [
  '#5E6AD2', // Linear indigo
  '#4EA7FC', // blue
  '#26B5CE', // cyan
  '#0F783C', // green
  '#F2C94C', // yellow
  '#F2994A', // orange
  '#EB5757', // red
  '#BB6BD9', // purple
  '#E773BC', // pink
  '#6B7280', // gray (triage/neutral)
] as const;

/**
 * Deterministic unicode-safe hash (FNV-1a over UTF-16 code units). Chosen over
 * `charCodeAt` summing because anagrams must not collide onto one colour —
 * "Bug" and "gBu" should not share a dot.
 */
export const hashLabelName = (name: string): number => {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    // FNV prime multiply, kept in 32-bit unsigned range.
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash >>> 0;
};

/** Stable palette colour for a label name. Empty names fall back to gray. */
export const labelPaletteColor = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return LABEL_DOT_PALETTE.at(-1)!;
  return LABEL_DOT_PALETTE[hashLabelName(trimmed) % LABEL_DOT_PALETTE.length];
};

/** Explicit colour wins; absent colour derives from the name. */
export const resolveLabelColor = (name: string, color?: null | string): string =>
  color?.trim() || labelPaletteColor(name);

/** Minimal shape a label needs for chip rendering. */
export interface LabelLike {
  color?: null | string;
  id?: string;
  name: string;
}

export interface PartitionedLabels<T> {
  /** Labels that did not fit — rendered behind the `+N` overflow chip. */
  overflow: T[];
  /** Labels rendered as individual chips. */
  visible: T[];
}

/**
 * Split a label list into rendered chips and an overflow bucket. `max` is the
 * number of individual chips shown before the `+N` collapse kicks in — Linear
 * keeps rows to one or two chips and folds the rest. `max` below 1 collapses
 * everything into the overflow chip.
 */
export const partitionLabelChips = <T>(items: readonly T[], max = 2): PartitionedLabels<T> => {
  if (items.length <= max) return { overflow: [], visible: [...items] };
  const count = Math.max(0, Math.floor(max));
  return { overflow: items.slice(count), visible: items.slice(0, count) };
};
