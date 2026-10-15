// Keep the Agent sidebar's section rows consistent without changing the shared accordion.
export const accordionStyles = {
  item: '[border-block-end-width:0] not-last:border-be-0',
  trigger:
    'gap-2 min-h-8 px-2 py-0.5 items-center justify-start rounded-(--radius-button) hover:no-underline',
  triggerIcon: 'flex-none -order-1 size-4 ms-0 first-of-type:-rotate-90 last-of-type:rotate-180',
};
