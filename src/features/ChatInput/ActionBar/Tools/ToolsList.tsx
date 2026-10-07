import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import type { ComponentType, ReactNode } from 'react';
import { createElement, Fragment, isValidElement, memo } from 'react';

import { buttonHoverFeedback } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

import type { ActionMenuItem } from '../../menuItems';
import { useDetailPopoverState } from '../components/useDetailPopoverState';
import { useScrollSignal } from './ScrollSignalContext';

export const toolsListStyles = createStaticStyles(({ css }) => ({
  groupLabel: css`
    padding-block: 12px 4px;
    padding-inline: 12px;
  `,
  item: css`
    cursor: pointer;

    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 6px;

    transition: background-color 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  itemContent: css`
    flex: 1;
    min-width: 0;
  `,
  itemIcon: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 24px;
    height: 24px;
  `,
}));

interface ToolItemData {
  children?: ToolItemData[];
  extra?: ReactNode;
  icon?: ReactNode;
  key?: string;
  label?: ReactNode;
  onClick?: () => void;
  /**
   * Optional rich content shown in a hover popover for this row.
   * When set, the row is wrapped with a Popover triggered on hover, similar
   * to the model selector's detail popover.
   */
  popoverContent?: ReactNode;
  type?: 'group' | 'divider';
}

interface ToolsListProps {
  detailPopoverDisabled?: boolean;
  items: ActionMenuItem[];
}

const SeparatorItem = memo<{ index: number }>(({ index }) => (
  <Separator key={`divider-${index}`} style={{ margin: '4px 0' }} />
));

const RegularItem = memo<{
  detailPopoverDisabled?: boolean;
  index: number;
  item: ToolItemData;
}>(({ detailPopoverDisabled, item, index }) => {
  const { close, onOpenChange, open } = useDetailPopoverState(detailPopoverDisabled);

  // Close hover popover whenever the surrounding list scrolls — avoids the
  // detail panel hovering in mid-air after its anchor row has moved away.
  useScrollSignal(close);

  const iconNode = item.icon ? (
    isValidElement(item.icon) ? (
      item.icon
    ) : (
      <span className="anticon" role="img">
        {createElement(
          item.icon as unknown as ComponentType<{
            fill?: string;
            height?: number | string;
            size?: number | string;
            width?: number | string;
          }>,
          { size: 20, width: 20, height: 20, fill: 'transparent' },
        )}
      </span>
    )
  ) : null;

  const row = (
    <div
      className={cn(item.onClick && buttonHoverFeedback, toolsListStyles.item)}
      key={item.key || `item-${index}`}
      role={item.onClick ? 'button' : undefined}
      tabIndex={item.onClick ? 0 : undefined}
      onClick={item.onClick}
    >
      {iconNode && <div className={toolsListStyles.itemIcon}>{iconNode}</div>}
      <div className={toolsListStyles.itemContent}>{item.label}</div>
      {item.extra}
    </div>
  );

  if (!item.popoverContent) return row;

  // The detail card is a hover information surface: keep it inert
  // (pointer-events: none) so a press can never land on the portal'd card and
  // be read as an outside press that dismisses the surrounding popover.
  return (
    <Popover open={!detailPopoverDisabled && open} onOpenChange={onOpenChange}>
      <PopoverTrigger openOnHover delay={300} disabled={detailPopoverDisabled} render={row} />
      <PopoverContent
        align={'start'}
        className={'pointer-events-none w-auto p-0'}
        side={'right'}
        sideOffset={8}
      >
        {item.popoverContent}
      </PopoverContent>
    </Popover>
  );
});

const GroupItem = memo<{
  detailPopoverDisabled?: boolean;
  index: number;
  item: ToolItemData;
}>(({ detailPopoverDisabled, item, index }) => (
  <Fragment key={item.key || `group-${index}`}>
    <div className={cn('text-[12px] text-muted-foreground', toolsListStyles.groupLabel)}>
      {item.label}
    </div>
    {item.children?.map((child, childIndex) => (
      <ToolListItem
        detailPopoverDisabled={detailPopoverDisabled}
        index={childIndex}
        item={child}
        key={child.key || `item-${childIndex}`}
      />
    ))}
  </Fragment>
));

const ToolListItem = memo<{
  detailPopoverDisabled?: boolean;
  index: number;
  item: ToolItemData | null;
}>(({ detailPopoverDisabled, item, index }) => {
  if (!item) return null;
  if (item.type === 'divider') return <SeparatorItem index={index} />;
  if (item.type === 'group')
    return <GroupItem detailPopoverDisabled={detailPopoverDisabled} index={index} item={item} />;
  return <RegularItem detailPopoverDisabled={detailPopoverDisabled} index={index} item={item} />;
});

const ToolsList = memo<ToolsListProps>(({ detailPopoverDisabled, items }) => {
  return (
    <div className="flex flex-col gap-0 p-1">
      {items.map((item, index) => (
        <ToolListItem
          detailPopoverDisabled={detailPopoverDisabled}
          index={index}
          item={item as ToolItemData | null}
          key={item?.key || `item-${index}`}
        />
      ))}
    </div>
  );
});

export default ToolsList;
