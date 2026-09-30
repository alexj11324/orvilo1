import { Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { type ReactNode } from 'react';
import { memo } from 'react';

import HashTags from '../HashTags';
import Time from '../Time';
import { useCateColor } from '../useCateColor';

const ACTION_CLASSNAME = 'memory-masonry-actions';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actions: css`
    transition: opacity 0.15s ease;
  `,
  masonryCard: css`
    cursor: pointer;
    position: relative;
    background: ${cssVar.colorFillQuaternary};
    box-shadow: 0 0 0 1px ${cssVar.colorFillTertiary} inset;
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
        className={cn('flex flex-col gap-1 p-1', styles.masonryCard)}
        style={{
          height: '100%',
          background: cssVar.colorFillSecondary,

          background: cateColor?.backgroundColor,
        }}
        onClick={onClick}
      >
        <div
          className="flex flex-col flex-1 gap-3 py-4 px-3"
          style={{
            border: `1px solid ${cssVar.colorBorder}`,
            borderRadius: cssVar.borderRadiusLG,

            boxShadow: `0 4px 16px -4px ${cateColor?.shadowColor || 'rgba(0, 0, 0, 0.2)'}`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {(title || titleAddon) && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {title && typeof title === 'string' ? (
                  <Text
                    as={'h2'}
                    ellipsis={{ rows: 2 }}
                    fontSize={16}
                    style={{ lineHeight: 1.5, margin: 0 }}
                    weight={500}
                  >
                    {title}
                  </Text>
                ) : (
                  title
                )}
              </div>
              {typeof titleAddon === 'string' ? (
                <Tag variant="borderless">{titleAddon}</Tag>
              ) : (
                titleAddon
              )}
            </>
          )}
          {typeof children === 'string' ? (
            <Text as={'p'} color={cssVar.colorTextSecondary} ellipsis={{ rows: 4 }}>
              {children}
            </Text>
          ) : (
            children
          )}
          <HashTags hashTags={hashTags} />
          <div
            className="flex items-center gap-3 justify-between"
            style={{
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {footer}
            <Time capturedAt={capturedAt} />
          </div>
        </div>
        <div
          className="flex items-center justify-between py-2 px-2"
          style={{ width: '100%', overflow: 'hidden', position: 'relative' }}
        >
          <div
            className="flex items-center flex-1 gap-2"
            style={{
              overflow: 'hidden',
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            {badges}
          </div>
          <div className="flex items-center justify-center" style={{ flex: 'none' }}>
            <Text
              align={'center'}
              color={cateColor?.backgroundTextColor || cssVar.colorTextSecondary}
              weight={'bold'}
              style={{
                opacity: 0.5,
              }}
            >
              {cate?.toUpperCase() || 'CHORE'}
            </Text>
          </div>
          <div
            className={cn(
              'flex items-center flex-1 gap-1 justify-end',
              cx(ACTION_CLASSNAME, styles.actions),
            )}
            style={{
              overflow: 'hidden',
            }}
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
