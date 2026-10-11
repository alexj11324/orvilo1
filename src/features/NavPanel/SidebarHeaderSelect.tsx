'use client';

import { cx } from 'antd-style';
import { ChevronsUpDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { memo, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SidebarHeaderSelectPopoverProps {
  children: ReactNode;
  content: ReactNode | ((closePopover: () => void) => ReactNode);
  width?: number;
}

export const SidebarHeaderSelectPopover = memo<SidebarHeaderSelectPopoverProps>(
  ({ children, content, width = 280 }) => {
    const [open, setOpen] = useState(false);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <span
              className="inline-flex data-[popup-open]:bg-accent"
              data-popup-open={open || undefined}
            >
              {children}
            </span>
          }
        />
        <PopoverContent
          align="start"
          className="max-h-[min(420px,70vh)] overflow-hidden p-0"
          side="bottom"
          style={{ width }}
        >
          {typeof content === 'function' ? content(() => setOpen(false)) : content}
        </PopoverContent>
      </Popover>
    );
  },
);

// Popover clones this trigger to inject onClick/ref; rest must reach the row div.
interface SidebarHeaderSelectTriggerProps extends Omit<ComponentProps<'div'>, 'title'> {
  avatar?: ReactNode | string;
  background?: string;
  /** Plain-text name behind `title`, seeding the avatar fallback. */
  name?: string;
  title: ReactNode;
}

export const SidebarHeaderSelectTrigger = memo<SidebarHeaderSelectTriggerProps>(
  ({ avatar, background, className, name, style, title, ...rest }) => (
    <div
      style={style}
      className={cx(
        'flex min-h-8 min-w-8 cursor-pointer items-center gap-2 overflow-hidden rounded-(--radius-button) p-0.5 text-sm hover:bg-accent',
        className,
      )}
      {...rest}
    >
      <Avatar avatar={avatar} background={background} name={name} shape={'square'} size={28} />
      <div className="truncate font-medium">{title}</div>
      <ActionIcon
        icon={ChevronsUpDownIcon}
        size={{ blockSize: 24, borderRadius: 'var(--radius-button)', size: 16 }}
      />
    </div>
  ),
);

SidebarHeaderSelectPopover.displayName = 'SidebarHeaderSelectPopover';
SidebarHeaderSelectTrigger.displayName = 'SidebarHeaderSelectTrigger';
