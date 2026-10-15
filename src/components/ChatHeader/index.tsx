'use client';

import { cn } from 'cn';
import { ChevronLeft } from 'lucide-react';
import type { ComponentProps, CSSProperties, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

export interface ChatHeaderProps extends Omit<ComponentProps<'header'>, 'ref'> {
  center?: ReactNode;
  classNames?: Partial<Record<'center' | 'left' | 'right', string>>;
  gaps?: Partial<Record<'center' | 'left' | 'right', number>>;
  left?: ReactNode;
  onBackClick?: () => void;
  ref?: Ref<HTMLElement>;
  right?: ReactNode;
  safeArea?: boolean;
  showBackButton?: boolean;
  styles?: Partial<Record<'center' | 'left' | 'right', CSSProperties>>;
}

export interface ChatHeaderTitleProps {
  desc?: ReactNode;
  tag?: ReactNode;
  title: ReactNode;
}

function ChatHeaderTitle({ title, desc, tag }: ChatHeaderTitleProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
      <div className="flex min-w-0 max-w-full items-center justify-center gap-1">
        <div className="min-w-0 truncate text-base font-semibold">{title}</div>
        {tag != null && <div className="flex shrink-0">{tag}</div>}
      </div>
      {desc != null && (
        <div className="max-w-full truncate text-xs text-foreground-tertiary">{desc}</div>
      )}
    </div>
  );
}

function ChatHeaderRoot({
  center,
  children,
  className,
  classNames,
  gaps,
  left,
  onBackClick,
  ref,
  right,
  safeArea = true,
  showBackButton,
  styles,
  ...props
}: ChatHeaderProps) {
  const { t } = useTranslation('common');
  const slotStyle = (slot: 'center' | 'left' | 'right'): CSSProperties | undefined =>
    gaps?.[slot] === undefined ? styles?.[slot] : { gap: gaps[slot], ...styles?.[slot] };

  return (
    <header
      className={cn('flex w-full shrink-0 flex-col overflow-hidden bg-background', className)}
      ref={ref}
      {...props}
    >
      {safeArea && (
        <div
          aria-hidden
          className="w-full shrink-0 overflow-hidden pt-[env(safe-area-inset-top)]"
        />
      )}
      <div className="relative flex h-11 min-h-11 max-h-11 w-full items-center justify-between px-1.5">
        <div
          className={cn('flex h-full min-w-0 flex-1 items-center justify-start', classNames?.left)}
          style={slotStyle('left')}
        >
          {showBackButton && (
            <Button aria-label={t('back')} size="icon-lg" variant="ghost" onClick={onBackClick}>
              <ChevronLeft />
            </Button>
          )}
          {left}
        </div>
        <div
          style={slotStyle('center')}
          className={cn(
            'flex h-full min-w-0 flex-1 items-center justify-center',
            classNames?.center,
          )}
        >
          {children}
          {center}
        </div>
        <div
          className={cn('flex h-full min-w-0 flex-1 items-center justify-end', classNames?.right)}
          style={slotStyle('right')}
        >
          {right}
        </div>
      </div>
    </header>
  );
}

const ChatHeader = Object.assign(ChatHeaderRoot, { Title: ChatHeaderTitle });

export { ChatHeader, ChatHeaderTitle };
export default ChatHeader;
