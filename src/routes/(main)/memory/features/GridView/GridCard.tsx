import { cn } from 'cn';
import { type ReactNode } from 'react';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import HashTags from '../HashTags';
import Time from '../Time';
import { useCateColor } from '../useCateColor';

const ACTION_CLASSNAME = 'memory-masonry-actions';

const styles = {
  actions:
    'transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none',
  masonryCard:
    'cursor-pointer relative rounded-(--radius-card) bg-fill-quaternary inset-ring-1 inset-ring-muted [&_.memory-masonry-actions]:opacity-0 [&:hover_.memory-masonry-actions]:opacity-100 [&:focus-within_.memory-masonry-actions]:opacity-100',
};

interface GridCardProps {
  actions?: ReactNode;
  badges?: ReactNode;
  capturedAt?: Date | number | string;
  cate?: string | null;
  children?: ReactNode;
  footer?: ReactNode;
  hashTags?: string[] | null;
  onClick?: () => void;
  title?: ReactNode;
  titleAddon?: ReactNode;
}

const GridCard = memo<GridCardProps>(
  ({
    title,
    titleAddon,
    cate,
    children,
    actions,
    onClick,
    hashTags,
    badges,
    footer,
    capturedAt,
  }) => {
    const cateColor = useCateColor(cate);
    return (
      <div
        {...clickableProps()}
        className={cn(
          cn('flex flex-col gap-1 p-1 h-full', styles.masonryCard),
          CLICKABLE_FOCUS_RING,
        )}
        style={{
          background: cateColor?.backgroundColor,
        }}
        onClick={onClick}
      >
        <div
          className="relative overflow-hidden flex flex-col flex-1 gap-3 py-4 px-3 border border-border rounded-(--radius-card) shadow-(--shadow-raised)"
          style={{
            boxShadow: cateColor ? `0 4px 16px -4px ${cateColor.shadowColor}` : undefined,
          }}
        >
          {(title || titleAddon) && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {title && typeof title === 'string' ? (
                  <h2 className="line-clamp-2 text-base font-semibold leading-6 m-0">{title}</h2>
                ) : (
                  title
                )}
              </div>
              {typeof titleAddon === 'string' ? (
                <Badge variant="secondary">{titleAddon}</Badge>
              ) : (
                titleAddon
              )}
            </>
          )}
          {typeof children === 'string' ? (
            <p className="line-clamp-4 text-sm text-muted-foreground">{children}</p>
          ) : (
            children
          )}
          <HashTags hashTags={hashTags} />
          <div className="relative overflow-hidden flex items-center gap-3 justify-between">
            {footer}
            <Time capturedAt={capturedAt} />
          </div>
        </div>
        <div className="relative overflow-hidden flex items-center justify-between py-2 px-2 w-full">
          <div
            className="overflow-hidden flex items-center flex-1 gap-2"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            {badges}
          </div>
          <div className="flex flex-col items-center justify-center flex-none">
            <div
              className="text-center text-xs font-medium text-muted-foreground"
              style={{
                color: cateColor?.backgroundTextColor,
              }}
            >
              {cate?.toUpperCase() || 'CHORE'}
            </div>
          </div>
          <div
            className={cn(
              'overflow-hidden flex items-center flex-1 gap-1 justify-end',
              cn(ACTION_CLASSNAME, styles.actions),
            )}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            {actions}
          </div>
        </div>
      </div>
    );
  },
);

export default GridCard;
