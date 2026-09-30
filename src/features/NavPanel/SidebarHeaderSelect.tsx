'use client';

import { createStaticStyles, cx } from 'antd-style';
import { ChevronsUpDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { memo, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';

const styles = createStaticStyles(({ css, cssVar }) => ({
  trigger: css`
    &[data-popup-open] {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

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
            <span className={cx('inline-flex', styles.trigger)} data-popup-open={open || undefined}>
              {children}
            </span>
          }
        />
        <PopoverContent
          align="start"
          side="bottom"
          style={{
            maxHeight: 'min(420px, 70vh)',
            overflow: 'hidden',
            padding: 0,
            paddingBlock: 0,
            paddingInline: 0,
            width,
          }}
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
      style={{ borderRadius: 10, minWidth: 32, overflow: 'hidden', ...style }}
      className={cx(
        className,
        'flex cursor-pointer items-center gap-2 p-[2px] hover:bg-[var(--ant-color-fill-tertiary)]',
      )}
      {...rest}
    >
      <Avatar avatar={avatar} background={background} name={name} shape={'square'} size={28} />
      <div className="truncate font-medium">{title}</div>
      <ActionIcon
        icon={ChevronsUpDownIcon}
        size={DESKTOP_HEADER_ICON_SMALL_SIZE}
        style={{ width: 24 }}
      />
    </div>
  ),
);

SidebarHeaderSelectPopover.displayName = 'SidebarHeaderSelectPopover';
SidebarHeaderSelectTrigger.displayName = 'SidebarHeaderSelectTrigger';
