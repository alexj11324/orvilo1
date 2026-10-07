'use client';

import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { FileText } from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { memo } from 'react';

import { buttonHoverFeedback } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actionable: css`
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  avatar: css`
    flex: none;
    align-self: stretch;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorFillQuaternary};
  `,
  openLabel: css`
    display: flex;
    align-items: center;

    height: 28px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 6px;

    font-size: 13px;
    line-height: 1;
    color: ${cssVar.colorText};
    white-space: nowrap;

    background: ${cssVar.colorBgContainer};
  `,
  actionButton: css`
    cursor: pointer;

    height: 28px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 6px;

    font-size: 13px;
    line-height: 1;
    color: ${cssVar.colorText};
    white-space: nowrap;

    background: ${cssVar.colorBgContainer};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
  container: css`
    overflow: hidden;

    width: 100%;
    height: 64px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    color: ${cssVar.colorText};

    background: ${cssVar.colorBgContainer};
  `,
  content: css`
    overflow: hidden;
    min-width: 0;
  `,
  desc: css`
    font-size: 12px;
    line-height: 1.3;
    color: ${cssVar.colorTextTertiary};
  `,
  title: css`
    font-weight: 500;
    line-height: 1.35;
  `,
  trigger: css`
    overflow: hidden;
    min-width: 0;
    height: 100%;
  `,
}));

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
      <div className={cn('flex items-center', cx(styles.container, className))}>
        <div
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          className={cx(
            cn('flex items-center flex-1', cx(styles.trigger, onOpen && styles.actionable)),
            onOpen && buttonHoverFeedback,
          )}
          onClick={onOpen}
          onKeyDown={onOpen ? handleKeyDown : undefined}
        >
          <div
            className={cn('flex items-center justify-center', styles.avatar)}
            style={{ width: 64 }}
          >
            {icon ?? <FileText size={28} />}
          </div>
          <div className={cn('flex flex-col flex-1 gap-1 px-3', styles.content)}>
            <div className={cn('truncate', styles.title)}>{title}</div>
            {description && <div className={cn('truncate', styles.desc)}>{description}</div>}
          </div>
          {onOpen && openLabel && (
            <div className="flex flex-col" style={{ flex: 'none', paddingInlineEnd: 10 }}>
              <div aria-hidden className={styles.openLabel}>
                {openLabel}
              </div>
            </div>
          )}
        </div>
        {(secondaryAction || secondaryActionLabel) && (
          <div className="flex flex-col" style={{ flex: 'none', paddingInlineEnd: 10 }}>
            {secondaryAction ?? (
              <>
                {onSecondaryAction ? (
                  <button
                    className={styles.actionButton}
                    type={'button'}
                    onClick={handleSecondaryActionClick}
                  >
                    {secondaryActionLabel}
                  </button>
                ) : (
                  <div aria-hidden className={styles.openLabel}>
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
          <TooltipTrigger render={<span style={{ display: 'inline-flex' }}>{card}</span>} />
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
