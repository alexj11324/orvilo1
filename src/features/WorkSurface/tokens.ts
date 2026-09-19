/**
 * Geometry tokens for the work-surface layout skeletons (v6 parity).
 *
 * The contract: gutters are fixed pixels and never balloon with the viewport;
 * a work surface is a CSS container (`container-name: work-surface`) so
 * columns, toolbars and cells respond to the *surface* width — which already
 * discounts the sidebar and any user-opened sidepanes — not the window.
 *
 * None of these read the chat `wideScreen` toggle: a data page keeps one size
 * story no matter how the user prefers their conversation column.
 */

/** Fixed inline gutter shared by collection and document frames. */
export const WORK_SURFACE_GUTTER_X = 16;
/** Default block padding inside a frame's scroll body. */
export const WORK_SURFACE_GUTTER_Y = 16;
/** Max readable width of a `document` surface's content column. */
export const WORK_SURFACE_DOCUMENT_MAX_WIDTH = 960;
/** Default list-pane width of a `split` surface. */
export const WORK_SURFACE_SPLIT_LIST_WIDTH = 360;
/** Container width at which a toolbar's secondary controls collapse into the overflow popover. */
export const WORK_SURFACE_TOOLBAR_COLLAPSE_WIDTH = 560;
/** Container query name — scopes every `@container` rule to the owning surface. */
export const WORK_SURFACE_CONTAINER = 'work-surface';
