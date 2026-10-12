// Closed native classes: indicator widths still come from the message-length data.
export const minimapStyles = {
  container:
    'pointer-events-none absolute z-1 inset-bs-4 inset-be-30 inset-e-2 flex flex-col items-end justify-center',
  hoverArea: 'pointer-events-auto relative flex flex-col items-end',
  previewPanel:
    'absolute inset-bs-1/2 inset-e-0 origin-right overflow-hidden flex min-w-60 max-w-90 border border-divider rounded-(--radius-overlay) bg-popover shadow-(--shadow-popover) transition-[opacity,transform] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out)',
  rail: 'overflow-y-auto flex flex-col gap-0 items-end max-h-[50vh] scrollbar-none [&::-webkit-scrollbar]:hidden transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out)',
};

export const indicatorStyles = {
  indicator: 'justify-end p-0',
  indicatorContent: 'block h-0.5 shrink-0 rounded-full',
};

export const previewStyles = {
  dash: 'block shrink-0 h-0.5 rounded-full',
  item: 'justify-end gap-2.5 px-3 font-normal transition-colors duration-(--orvilo-motion-fast) ease-(--orvilo-motion-ease-in-out) [&:hover]:bg-accent [&:hover]:text-foreground',
  label: 'line-clamp-1 min-w-0 text-sm leading-5.5 text-end [word-break:break-word]',
  list: 'overflow-y-auto max-h-[60vh] p-1 scrollbar-thin [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-selected',
};
