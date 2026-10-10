import { createStaticStyles } from 'antd-style';

import { TAB_INLINE_INSET } from './tabLayout';

const TAB_HEIGHT = 26;

const registeredTabStyles = createStaticStyles(({ css, cssVar }) => ({
  closeIcon: css`
    pointer-events: none;

    position: absolute;
    inset-inline-end: 3px;

    flex-shrink: 0;

    color: ${cssVar.colorTextTertiary};

    opacity: 0;

    transition: opacity 0.15s ${cssVar.motionEaseInOut};

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  runningDot: css`
    position: absolute;
    inset-block-end: -2px;
    inset-inline-end: -2px;

    width: 8px;
    height: 8px;
    border: 1.5px solid ${cssVar.colorBgLayout};
    border-radius: 50%;

    background: ${cssVar.gold};
    box-shadow: 0 0 6px ${cssVar.gold};
  `,
  // Tabs are absolutely positioned inside this box so that pinning can spring a tab
  // across to its new slot; a flex reorder could only teleport it. The box tracks the
  // strip's own width so the trailing "+" follows the tabs instead of jumping.
  strip: css`
    position: relative;
    flex: none;
    height: ${TAB_HEIGHT}px;
  `,
  tab: css`
    cursor: default;
    user-select: none;

    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;

    display: flex;
    flex-shrink: 0;
    gap: 6px;
    align-items: center;

    height: ${TAB_HEIGHT}px;

    /* The start is the resting value only; TabItem overrides it with a sprung inset so the
       avatar can travel to the middle of a tab that has shrunk to icon width. */
    padding-inline: ${TAB_INLINE_INSET}px 6px;
    border-radius: ${cssVar.borderRadius};

    font-size: 12px;

    background-color: transparent;

    transition: background-color 0.15s ${cssVar.motionEaseInOut};

    &:hover {
      background-color: ${cssVar.colorFillQuaternary};
    }

    /* Nothing here may touch layout. The tier is resolved from the target width, so this
       rule lands a whole spring before the box reaches it: centring the avatar from here
       applied while the tab was still 200px wide and threw it into the middle of a box it
       had not begun to shrink into — a jump to the right before the travel left. The
       avatar still centres at this tier, but through the sprung inset in TabItem, which
       arrives with the width instead of ahead of it. The title likewise only fades:
       collapsing its width clipped the fade away in the frame it started. */
    &[data-tier='icon'] {
      [data-tab-title] {
        opacity: 0;
      }
    }

    /* The button and the room for it are one rule on purpose: reserving the footprint
       full-time cost the title 17px it almost never needed, and revealing the button
       without the reservation would run the title's fade straight under it. Sharing a
       selector makes the second state unreachable. Both sides ease over the same 0.15s,
       so the gap opens exactly as the glyph arrives.

       Below the compact tier neither appears: the tab cannot spare the button's 20px —
       the title would be cut to a couple of glyphs — and at icon width the avatar is the
       only identity signal left. Pinned tabs are always at icon width, so they fall out
       too. The button stays mounted at every tier and fades; unmounting it made it vanish
       mid-pin.

       A lone tab never mounts the button (the last tab cannot close), so :has([data-
       tab-close]) keeps the title margin from opening a hole for a control that is not
       there — which otherwise still ran the mask gradient in as if a close affordance
       were arriving.

       :has() also carries the keyboard path — the button is focusable at these tiers, so
       without it a tabbing user would land on something invisible.

       Reservation is 20px button + 3px inset - the tab's own 6px end padding. Margin
       rather than padding: the mask applies to the padding box, so padding would put the
       gradient inside the reservation instead of at the text's edge. */
    &[data-tier='full']:hover:has([data-tab-close]),
    &[data-tier='compact']:hover:has([data-tab-close]),
    &[data-tier='full']:has([data-tab-close]:focus-visible),
    &[data-tier='compact']:has([data-tab-close]:focus-visible) {
      [data-tab-close] {
        pointer-events: auto;
        opacity: 1;
      }

      [data-tab-title] {
        margin-inline-end: 17px;
      }
    }
  `,
  pinnedDivider: css`
    position: absolute;
    inset-block-start: 4px;
    inset-inline-start: 0;

    width: 1px;
    height: 18px;

    background-color: ${cssVar.colorBorder};

    transition: opacity 0.18s ${cssVar.motionEaseInOut};
  `,
  // A pinned tab renders at icon width, which is pixel-identical to an unpinned tab
  // squeezed by a crowded strip — the surface is what tells the two apart. Declared
  // ahead of `tabActive` so that an active pinned tab still reads as active:
  // createStaticStyles settles equal specificity by definition order.
  tabPinned: css`
    background-color: ${cssVar.colorFillQuaternary};

    &:hover {
      background-color: ${cssVar.colorFillTertiary};
    }
  `,
  tabSplitVisible: css`
    &::after {
      content: '';

      position: absolute;
      inset-block-end: 1px;
      inset-inline: 8px;

      height: 1px;
      border-radius: 1px;

      opacity: 0.65;
      background: ${cssVar.colorPrimary};
    }
  `,
  tabDragging: css`
    cursor: grabbing;
    z-index: 1;
    background-color: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  // The active tab floats above the titlebar rather than merging into the content card.
  // An attached (Chrome-style) treatment was built and tried on the real desktop app and
  // rejected: the seam it produced read worse than the separation it replaced.
  tabActive: css`
    background-color: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowTertiary};

    &:hover {
      background-color: ${cssVar.colorBgElevated};
    }

    html.desktop[data-theme='dark'] & {
      background-color: ${cssVar.colorFillSecondary};
      box-shadow: inset 0 0 0 1px ${cssVar.colorBorderSecondary};

      &:hover {
        background-color: ${cssVar.colorFillSecondary};
      }
    }
  `,
  tabTitle: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font-size: 12px;
    color: ${cssVar.colorText};
    white-space: nowrap;

    transition:
      margin-inline-end 0.15s ${cssVar.motionEaseInOut},
      opacity 0.12s ${cssVar.motionEaseInOut};

    /* The one physical direction left in this file — mask-image has no logical form, and
       nothing in the app sets dir="rtl". max(60%, …) caps the ramp at 40% of the box:
       a narrow tab leaves the title barely 22px to live in, and a flat 20px ramp would
       swallow the whole word rather than trailing it off. */
    mask-image: linear-gradient(to right, #000 max(60%, calc(100% - 20px)), transparent);
  `,
}));

export const useStyles = {
  ...registeredTabStyles,
  avatarWrapper: 'relative flex flex-none items-center justify-center size-4 leading-0',
  unreadDot:
    'absolute -bottom-0.5 -end-0.5 size-2 border-[1.5px] border-background rounded-full bg-info',
  container: 'flex-1 min-w-0',
  overflowButton:
    'cursor-default shrink-0 justify-center h-8 rounded-(--radius-button) text-xs leading-5 text-muted-foreground hover:text-foreground hover:bg-accent',
  previewCard: 'flex flex-col gap-1.5 w-60',
  previewImage:
    'block aspect-[16/10] w-full border border-divider rounded-(--radius-card) object-cover object-top',
  previewTitle: 'truncate text-xs leading-5',
  tabIcon: 'shrink-0 text-muted-foreground',
  newTabButton:
    'inline-flex shrink-0 items-center justify-center rounded-(--radius-button) text-muted-foreground transition-colors duration-(--orvilo-motion-fast) ease-(--ant-motion-ease-in-out) hover:text-foreground hover:bg-accent motion-reduce:transition-none',
};
