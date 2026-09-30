import { type ComponentProps, type ReactNode } from 'react';
import { memo } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';

import Loading from '@/routes/(main)/memory/features/Loading';

import { useScrollParent } from '../TimeLineView/useScrollParent';

interface GridViewProps<T> {
  /**
   * Default column count (rows in Grid component)
   * Will be responsive based on window width
   */
  defaultColumnCount?: number;
  /**
   * Whether there are more items to load
   */
  hasMore?: boolean;
  /**
   * Whether data is currently loading
   */
  isLoading?: boolean;
  items: T[];
  /**
   * Max item width in pixels
   */
  maxItemWidth?: number;
  /**
   * Callback when end is reached
   */
  onLoadMore?: () => void;
  renderItem: (item: T, actions: ItemActions<T>) => ReactNode;
}

interface ItemActions<T> {
  onClick?: (item: T) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
}

function GridViewInner<T extends { id: string }>({
  items,
  defaultColumnCount = 3,
  maxItemWidth = 240,
  hasMore,
  isLoading,
  onLoadMore,
  renderItem,
}: GridViewProps<T>) {
  const scrollParent = useScrollParent();

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <VirtuosoGrid
      customScrollParent={scrollParent}
      data={items}
      endReached={hasMore && onLoadMore ? onLoadMore : undefined}
      increaseViewportBy={typeof window !== 'undefined' ? window.innerHeight : 0}
      overscan={48}
      style={{ minHeight: '100%' }}
      components={{
        Footer: isLoading
          ? () => <Loading rows={defaultColumnCount} viewMode={'grid'} />
          : undefined,
        // eslint-disable-next-line @eslint-react/no-nested-component-definitions
        List: (({
          ref,
          ...props
        }: ComponentProps<'div'> & {
          ref?: React.RefObject<HTMLDivElement | null>;
        }) => (
          <div
            className="grid gap-2"
            ref={ref}
            {...props}
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(max(${maxItemWidth}px, calc((100% - 8px * ${defaultColumnCount - 1}) / ${defaultColumnCount})), 1fr))`,
              ...props.style,
            }}
          />
        )) as any,
      }}
      itemContent={(index, item) => {
        if (!item || !item.id) {
          return null;
        }

        const actions: ItemActions<T> = {
          onClick: undefined,
          onDelete: undefined,
          onEdit: undefined,
        };

        return renderItem(item, actions);
      }}
    />
  );
}

export const GridView = memo(GridViewInner) as typeof GridViewInner;
