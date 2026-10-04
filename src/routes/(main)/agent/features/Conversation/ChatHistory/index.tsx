'use client';

import { type ComponentProps, memo, type ReactNode, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import Content from './Content';

interface ChatHistoryMenuProps {
  children: ReactNode;
  classNames?: {
    trigger?: string;
  };
  nativeButton?: boolean;
  placement?: 'bottomLeft' | 'topRight' | 'bottom' | 'top';
  triggerProps?: ComponentProps<'button'>;
}

/**
 * The `Chat history` menu the header title trigger and the bottom-right
 * utility control both open (same searchable topic data, different anchors —
 * `bottomLeft` under the title, `topRight` above the corner control).
 */
const ChatHistoryMenu = memo<ChatHistoryMenuProps>(
  ({ children, classNames, nativeButton = true, placement = 'bottomLeft', triggerProps }) => {
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
        <PopoverTrigger
          className={classNames?.trigger}
          nativeButton={nativeButton}
          {...triggerProps}
        >
          {children}
        </PopoverTrigger>
        <PopoverContent
          align={align}
          className="w-80 max-w-[calc(100vw-32px)] overflow-hidden p-0"
          side={side}
        >
          <Content onNavigate={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    );
  },
);

ChatHistoryMenu.displayName = 'ChatHistoryMenu';

export default ChatHistoryMenu;
