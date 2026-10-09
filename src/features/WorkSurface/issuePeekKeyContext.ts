import { isInteractiveRowClick, ISSUE_ROW_ATTRIBUTE } from './peekTrigger';

/** Marks the peek pane root so keys pressed inside it still reach the list. */
export const ISSUE_PEEK_PANE_ATTRIBUTE = 'data-issue-peek-pane';

/** Elements whose keystrokes are text, never navigation. */
const TYPING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="searchbox"]',
].join(', ');

/**
 * An open menu / popover / dialog / command palette owns the keyboard (and
 * Esc). Base UI marks the open trigger with `data-popup-open`; the popup
 * itself carries its ARIA role while mounted.
 */
const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[aria-modal="true"]',
  '[cmdk-root]',
  '[data-popup-open]',
].join(', ');

export interface IssueKeyScope {
  /** The key came from the row list or the page body, not the peek pane. */
  fromList: boolean;
  /**
   * The target is a real control (button / link / menu trigger) — Space and
   * Enter keep their native meaning there.
   */
  onControl: boolean;
  /** Identifier of the focused row when the key came from a row (or inside it). */
  rowId: string | null;
}

/**
 * Whether a keydown belongs to the Issue-list shortcuts, and where it came
 * from. `null` means leave it alone: typing, an open overlay, or focus
 * somewhere unrelated (sidebar, toolbar, another region).
 */
export const resolveIssueKeyScope = (
  target: EventTarget | null,
  doc: Document = document,
): IssueKeyScope | null => {
  const element = target instanceof Element ? target : null;
  if (element?.closest(TYPING_SELECTOR)) return null;
  if (doc.querySelector(OVERLAY_SELECTOR)) return null;

  const body = doc.body;
  const atRoot = !element || element === body || element === doc.documentElement;
  const row = element?.closest(`[${ISSUE_ROW_ATTRIBUTE}]`) ?? null;
  const inPane = Boolean(element?.closest(`[${ISSUE_PEEK_PANE_ATTRIBUTE}]`));
  if (!atRoot && !row && !inPane) return null;

  return {
    fromList: atRoot || Boolean(row),
    onControl: Boolean(element) && !atRoot && isInteractiveRowClick(element),
    rowId: row?.getAttribute(ISSUE_ROW_ATTRIBUTE) ?? null,
  };
};

/** The mounted, non-duplicate row element for an Issue identifier. */
export const findIssueRowElement = (
  identifier: string,
  doc: Document = document,
): HTMLElement | null => {
  const rows = doc.querySelectorAll<HTMLElement>(`[${ISSUE_ROW_ATTRIBUTE}]`);
  for (const row of rows) {
    // A muted parent-context repeat of the same Issue is not the row to focus.
    if (
      row.getAttribute(ISSUE_ROW_ATTRIBUTE) === identifier &&
      !row.closest('[data-issue-context]')
    ) {
      return row;
    }
  }
  return null;
};
