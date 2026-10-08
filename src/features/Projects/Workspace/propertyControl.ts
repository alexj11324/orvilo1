/**
 * The one look every project property control shares (status, priority, lead,
 * dates, team, members, labels): a 28px ghost pill with the `bg-accent` hover
 * wash. Reuse this instead of restyling a control; an unlayered antd-style
 * class that sets `background` would beat the `hover:bg-accent` utility here.
 */
export const PROPERTY_CONTROL_CLASS =
  'h-7 w-auto max-w-full shrink-0 gap-2 rounded-full border-0 bg-transparent px-1.5 py-1 text-sm font-medium shadow-none hover:bg-accent focus-visible:bg-accent data-popup-open:bg-accent [&[data-slot=combobox-trigger]>svg:last-child]:hidden';

/**
 * The same pill for a control that is a link (the project's team).
 *
 * antd's unlayered global link reset (`a { background-color: transparent }` and
 * the `a:hover` rules) beats layered Tailwind utilities on anchors, so the
 * colour and hover/focus backgrounds are important here. The wash mirrors the
 * ghost Button siblings: `bg-accent` in light, `bg-muted/50` in dark. Drop the
 * `!` once the link reset is moved into a layer (#565).
 */
export const PROPERTY_LINK_CLASS = `${PROPERTY_CONTROL_CLASS} inline-flex items-center text-foreground! no-underline hover:text-foreground! hover:bg-accent! focus-visible:bg-accent! dark:hover:bg-muted/50!`;
