'use client';

import { memo, type ReactElement, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import Content from './Content';

interface ChatHistoryMenuProps {
  /** Trigger element — rendered inside the popover trigger slot. */
  children: ReactElement;
  placement?: 'bottomLeft' | 'topRight' | 'bottom' | 'top';
}

/**
 * The `Chat history` menu the header title trigger and the bottom-right
 * utility control both open (same searchable topic data, different anchors —
 * `bottomLeft` under the title, `topRight` above the corner control).
 */
const ChatHistoryMenu = memo<ChatHistoryMenuProps>(({ children, placement = 'bottomLeft' }) => {
  const [open, setOpen] = useState(false);
  const side = placement.startsWith('top') ? 'top' : 'bottom';
  const align =
    placement.endsWith('Left') || placement.endsWith('Top')
      ? 'start'
      : placement.endsWith('Right') || placement.endsWith('Bottom')
        ? 'end'
        : 'center';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent align={align} className="p-0" side={side}>
        <Content onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
});

ChatHistoryMenu.displayName = 'ChatHistoryMenu';

export default ChatHistoryMenu;
