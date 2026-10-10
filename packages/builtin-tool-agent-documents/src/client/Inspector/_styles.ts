/**
 * Shared chip styles used by every Agent Documents inspector.
 *
 * Inlining these in each inspector means changing the visual language
 * touches 9 files; keeping one source of truth keeps the toolset coherent
 * (e.g. the doc-id chip should look the same whether you Read or Rename).
 */
export const inspectorChipStyles = {
  /** Highlighted chip for the primary subject (title, new title, etc.) */
  chip: 'inline-flex shrink min-w-0 max-w-[280px] items-center truncate rounded-full bg-accent py-0.5 ps-2 pe-2 text-xs leading-[inherit] text-foreground',
  /** Compact, code-styled chip for raw identifiers */
  idChip:
    'shrink-0 rounded-full bg-accent py-0.5 ps-2 pe-2 [font-family:var(--ant-font-family-code)] text-xs leading-[inherit] text-muted-foreground',
  /** Inline middot used between segments */
  separator: 'shrink-0 text-[var(--ant-color-text-quaternary)]',
  /** Secondary, lower-contrast chip for metadata (counts, target scope, …) */
  subdued: 'shrink-0 text-xs leading-[inherit] text-[var(--ant-color-text-tertiary)]',
};

const UUID_LIKE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * Render a friendly short label for a document id. Full UUIDs are noisy in a
 * one-line header; their first 8 chars are unique enough for cross-referencing
 * within a single conversation. Prefixed ids (e.g. `agd_…`) are left intact —
 * they're already short and meaningful.
 */
export const formatDocumentId = (id?: string): string | undefined => {
  if (!id) return undefined;
  return UUID_LIKE.test(id) ? id.slice(0, 8) : id;
};
