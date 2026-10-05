import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { type ReactNode } from 'react';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

import CateTag from '../CateTag';
import HashTags from '../HashTags';
import Time from '../Time';

const ACTION_CLASSNAME = 'memory-actions';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    transition: opacity 0.15s ease;
  `,
  timelineCard: css`
    position: relative;
    .${ACTION_CLASSNAME} {
      opacity: 0;
    }

    &:hover {
      .${ACTION_CLASSNAME} {
        opacity: 1;
      }
    }
  `,
}));

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
        className={cn('flex flex-col gap-3 p-4', styles.timelineCard)}
        style={{ cursor: 'pointer' }}
        onClick={onClick}
      >
        {(title || titleAddon) && (
          <div
            className="flex items-center gap-1 flex-wrap"
            style={{
              width: '100%',

              overflow: 'hidden',
            }}
          >
            {title && typeof title === 'string' ? (
              <h2 className="text-[16px] font-medium" style={{ lineHeight: 1.5, margin: 0 }}>
                {title}
              </h2>
            ) : (
              title
            )}
            {!!titleAddon ? <Badge variant="primary-light">{titleAddon}</Badge> : titleAddon}
          </div>
        )}
        {typeof children === 'string' ? (
          <p className="line-clamp-3" style={{ color: cssVar.colorTextSecondary }}>
            {children}
          </p>
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
            className={cn('flex items-center gap-1', cx(ACTION_CLASSNAME, styles.actions))}
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
