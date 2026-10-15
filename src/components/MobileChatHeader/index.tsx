'use client';

import { cn } from 'cn';
import { ChevronLeft } from 'lucide-react';
import { type ComponentProps, type CSSProperties, memo, type ReactNode } from 'react';

import ActionIcon from '@/components/ActionIcon';

type Slot = 'center' | 'left' | 'right';

export interface ChatHeaderProps extends ComponentProps<'header'> {
  center?: ReactNode;
  classNames?: Partial<Record<Slot, string>>;
  gaps?: Partial<Record<Slot, number>>;
  left?: ReactNode;
  onBackClick?: () => void;
  right?: ReactNode;
  safeArea?: boolean;
  showBackButton?: boolean;
  styles?: Partial<Record<Slot, CSSProperties>>;
}

const slotStyle = (gap?: number, style?: CSSProperties): CSSProperties | undefined =>
  gap === undefined ? style : { gap, ...style };

const ChatHeaderBase = memo<ChatHeaderProps>(
  ({
    center,
    children,
    className,
    classNames,
    gaps,
    left,
    onBackClick,
    right,
    safeArea = true,
    showBackButton,
    styles,
    ...rest
  }) => (
    <header
      className={cn('flex w-screen flex-none flex-col overflow-hidden bg-background', className)}
      {...rest}
    >
      {safeArea && (
        <div className="w-screen flex-none overflow-hidden pt-[env(safe-area-inset-top)]" />
      )}
      <div className="relative flex h-11 max-h-11 min-h-11 w-full flex-1 items-center justify-between px-1.5">
        <div
          className={cn('flex h-full flex-1 items-center justify-start', classNames?.left)}
          style={slotStyle(gaps?.left, styles?.left)}
        >
          {showBackButton && <ActionIcon icon={ChevronLeft} onClick={() => onBackClick?.()} />}
          {left}
        </div>
        <div
          className={cn('flex h-full flex-1 items-center justify-center', classNames?.center)}
          style={slotStyle(gaps?.center, styles?.center)}
        >
          {children}
          {center}
        </div>
        <div
          className={cn('flex h-full flex-1 items-center justify-end', classNames?.right)}
          style={slotStyle(gaps?.right, styles?.right)}
        >
          {right}
        </div>
      </div>
    </header>
  ),
);

ChatHeaderBase.displayName = 'ChatHeader';

export interface ChatHeaderTitleProps {
  desc?: ReactNode;
  tag?: ReactNode;
  title: ReactNode;
}

const ChatHeaderTitle = memo<ChatHeaderTitleProps>(({ title, desc, tag }) => {
  if (desc)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1">
        <div className="flex flex-1 items-center gap-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-bold leading-none">
            {title}
          </div>
          {tag && <div className="flex flex-none">{tag}</div>}
        </div>
        <div className="flex items-center">
          <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-none text-foreground-tertiary">
            {desc}
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex flex-1 items-center justify-center gap-1">
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold leading-none">
        {title}
      </div>
      <div className="flex flex-none">{tag}</div>
    </div>
  );
});

ChatHeaderTitle.displayName = 'ChatHeaderTitle';

/** Mobile top bar: safe-area spacer plus a 44px left / center / right row. */
export const ChatHeader = Object.assign(ChatHeaderBase, { Title: ChatHeaderTitle });

export default ChatHeader;
