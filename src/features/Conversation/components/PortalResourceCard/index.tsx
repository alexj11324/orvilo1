'use client';

import { cn } from 'cn';
import { FileText } from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const styles = {
  actionable:
    'cursor-pointer hover:bg-accent outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
  avatar: 'flex-none self-stretch border-e border-divider bg-fill-quaternary',
  openLabel:
    'flex items-center h-8 px-3 border border-border rounded-(--radius-button) text-sm leading-5.5 text-foreground whitespace-nowrap bg-card',
  actionButton:
    "relative cursor-pointer px-3 border border-border rounded-(--radius-button) text-sm leading-5.5 text-foreground whitespace-nowrap bg-card hover:bg-accent outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset coarse:after:absolute coarse:after:-inset-[calc(var(--spacing)*1.75)] coarse:after:content-['']",
  container:
    'overflow-hidden w-full h-16 border border-divider rounded-(--radius-card) text-foreground bg-card',
  content: 'overflow-hidden min-w-0',
  desc: 'text-xs leading-5 text-foreground-tertiary',
  title: 'text-sm leading-5.5 font-semibold',
  trigger: 'overflow-hidden min-w-0 h-full',
};

export interface PortalResourceCardProps {
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  onOpen?: () => void;
  onSecondaryAction?: () => void;
  openLabel?: ReactNode;
  secondaryAction?: ReactNode;
  secondaryActionLabel?: ReactNode;
  title: ReactNode;
  tooltip?: ReactNode;
}

const PortalResourceCard = memo<PortalResourceCardProps>(
  ({
    className,
    description,
    icon,
    openLabel,
    secondaryAction,
    secondaryActionLabel,
    title,
    tooltip,
    onOpen,
    onSecondaryAction,
  }) => {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!onOpen) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      onOpen();
    };
    const handleSecondaryActionClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSecondaryAction?.();
    };

    // Mirrors the inline artifact card shell, while keeping portal-open behavior owned by callers.
    const card = (
      <div className={cn('flex items-center', cn(styles.container, className))}>
        <div
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          className={cn(
            'flex items-center flex-1',
            cn(styles.trigger, onOpen && styles.actionable),
          )}
          onClick={onOpen}
          onKeyDown={onOpen ? handleKeyDown : undefined}
        >
          <div className={cn('flex items-center justify-center w-16', styles.avatar)}>
            {icon ?? <FileText size={28} />}
          </div>
          <div className={cn('flex flex-col flex-1 gap-1 px-3', styles.content)}>
            <div className={cn('truncate', styles.title)}>{title}</div>
            {description && <div className={cn('truncate', styles.desc)}>{description}</div>}
          </div>
          {onOpen && openLabel && (
            <div className="flex flex-col flex-none pe-2.5">
              <div aria-hidden className={styles.openLabel}>
                {openLabel}
              </div>
            </div>
          )}
        </div>
        {(secondaryAction || secondaryActionLabel) && (
          <div className="flex flex-col flex-none pe-2.5">
            {secondaryAction ?? (
              <>
                {onSecondaryAction ? (
                  <span className="inline-flex flex-none coarse:p-1.5">
                    <Button
                      className={styles.actionButton}
                      size="compact"
                      type={'button'}
                      variant="outline"
                      onClick={handleSecondaryActionClick}
                    >
                      {secondaryActionLabel}
                    </Button>
                  </span>
                ) : (
                  <div aria-hidden className={cn(styles.openLabel, 'text-xs leading-5')}>
                    {secondaryActionLabel}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );

    return tooltip ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex">{card}</span>} />
          <TooltipContent align="start" side="top">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      card
    );
  },
);

PortalResourceCard.displayName = 'PortalResourceCard';

export default PortalResourceCard;
