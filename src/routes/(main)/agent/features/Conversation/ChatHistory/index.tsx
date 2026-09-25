'use client';

import { Popover, type PopoverProps } from '@lobehub/ui';
import { memo, useState } from 'react';

import Content from './Content';

interface ChatHistoryMenuProps extends Omit<PopoverProps, 'content' | 'onOpenChange' | 'open'> {
  /** Trigger element — rendered inside the popover trigger slot. */
  children: PopoverProps['children'];
}

/**
 * The `Chat history` menu the header title trigger and the bottom-right
 * utility control both open (same searchable topic data, different anchors —
 * `bottomLeft` under the title, `topRight` above the corner control).
 */
const ChatHistoryMenu = memo<ChatHistoryMenuProps>(
  ({ children, placement = 'bottomLeft', ...rest }) => {
    const [open, setOpen] = useState(false);

    return (
      <Popover
        arrow={false}
        content={<Content onNavigate={() => setOpen(false)} />}
        open={open}
        placement={placement}
        styles={{ content: { padding: 0 } }}
        trigger={'click'}
        {...rest}
        onOpenChange={setOpen}
      >
        {children}
      </Popover>
    );
  },
);

ChatHistoryMenu.displayName = 'ChatHistoryMenu';

export default ChatHistoryMenu;
