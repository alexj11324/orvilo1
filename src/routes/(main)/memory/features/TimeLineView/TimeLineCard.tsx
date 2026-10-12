import { cn } from 'cn';
import { type ReactNode } from 'react';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import CateTag from '../CateTag';
import HashTags from '../HashTags';
import Time from '../Time';

const ACTION_CLASSNAME = 'memory-actions';

const styles = {
  actions:
    'transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none',
  timelineCard:
    'relative rounded-(--radius-card) [&_.memory-actions]:opacity-0 [&:hover_.memory-actions]:opacity-100 [&:focus-within_.memory-actions]:opacity-100',
};

interface TimeLineCardProps {
  actions?: ReactNode;
  capturedAt?: Date | number | string;
  cate?: string | null;
  children?: ReactNode;
  hashTags?: string[] | null;
  onClick?: () => void;
  title?: ReactNode;
  titleAddon?: ReactNode;
}

const TimeLineCard = memo<TimeLineCardProps>(
  ({ title, titleAddon, cate, children, actions, onClick, capturedAt, hashTags }) => {
    return (
      <div
        {...clickableProps()}
        className={cn(
          cn('flex flex-col gap-3 p-4 cursor-pointer', styles.timelineCard),
          CLICKABLE_FOCUS_RING,
        )}
        onClick={onClick}
      >
        {(title || titleAddon) && (
          <div className="flex items-center gap-1 flex-wrap w-full overflow-hidden">
            {title && typeof title === 'string' ? (
              <h2 className="text-base font-semibold leading-6 m-0">{title}</h2>
            ) : (
              title
            )}
            {!!titleAddon ? <Badge variant="primary-light">{titleAddon}</Badge> : titleAddon}
          </div>
        )}
        {typeof children === 'string' ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{children}</p>
        ) : (
          children
        )}
        <HashTags hashTags={hashTags} />
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <CateTag cate={cate} />
            <Time capturedAt={capturedAt} />
          </div>
          <div
            className={cn('flex items-center gap-1', cn(ACTION_CLASSNAME, styles.actions))}
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

export default TimeLineCard;
