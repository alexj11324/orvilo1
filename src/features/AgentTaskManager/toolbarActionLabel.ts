interface ToolbarActionLabel {
  'aria-label': string;
  'title': string | undefined;
}

/**
 * Labels for an icon-only toolbar action whose text lives in a lazily loaded
 * namespace. Until the namespace is ready the tooltip is withheld, so no raw
 * key flashes, but the button keeps an accessible name from the fallback.
 */
export const toolbarActionLabel = (
  ready: boolean,
  translated: string,
  fallback: string,
): ToolbarActionLabel => ({
  'aria-label': ready ? translated : fallback,
  'title': ready ? translated : undefined,
});
