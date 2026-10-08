/**
 * The one look every project property control shares (status, priority, lead,
 * dates, team, members, labels): a 28px ghost pill with the `bg-accent` hover
 * wash. Reuse this instead of restyling a control; an unlayered antd-style
 * class that sets `background` would beat the `hover:bg-accent` utility here.
 */
export const PROPERTY_CONTROL_CLASS =
  'h-7 w-auto max-w-full shrink-0 gap-2 rounded-full border-0 bg-transparent px-1.5 py-1 text-sm font-medium shadow-none hover:bg-accent focus-visible:bg-accent data-popup-open:bg-accent [&[data-slot=combobox-trigger]>svg:last-child]:hidden';

/** The same pill for a control that is a link (the project's team). */
export const PROPERTY_LINK_CLASS = `${PROPERTY_CONTROL_CLASS} inline-flex items-center text-foreground! no-underline hover:text-foreground! dark:hover:bg-muted/50`;
