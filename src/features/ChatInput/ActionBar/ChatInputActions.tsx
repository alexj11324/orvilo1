'use client';

import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import type { ChatActionItem, ChatInputActionsProps, ChatPlainAction } from './actionItems';
import ActionDropdown from './components/ActionDropdown';

function PlainAction({
  item,
  disabled,
  onActionClick,
}: {
  item: ChatPlainAction;
  disabled?: boolean;
  onActionClick: ChatInputActionsProps['onActionClick'];
}) {
  const body: ReactNode = item.children ?? (
    <ActionIcon
      active={item.active}
      danger={item.danger}
      disabled={disabled || item.disabled || item.loading}
      icon={item.icon}
      loading={item.loading}
      size={{ blockSize: 36, size: 20 }}
      title={item.label}
      tooltipProps={item.tooltipProps}
      onClick={(event) => {
        const key = String(item.key ?? '');
        onActionClick?.({ domEvent: event, key, keyPath: [key] });
        item.onClick?.(event);
      }}
    />
  );
  return item.wrapper ? item.wrapper(body) : body;
}

/** Existing controls keep their own state/menus. The collection owns only
 * grouping and overflow, and never clones controls for offscreen measurement. */
export function ChatInputActions({
  items = [],
  disabled,
  groupCollapse,
  defaultGroupCollapse = false,
  onGroupCollapseChange,
  autoCollapse = true,
  collapseOffset = 0,
  gap = 2,
  onActionClick,
  className,
  style,
  ...rest
}: ChatInputActionsProps) {
  const { t } = useTranslation('common');
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [internalCollapsed, setInternalCollapsed] = useState(defaultGroupCollapse);
  const groupCollapsed = groupCollapse ?? internalCollapsed;
  const setGroupCollapsed = (next: boolean) => {
    if (groupCollapse === undefined) setInternalCollapsed(next);
    onGroupCollapseChange?.(next);
  };
  useEffect(() => {
    const element = root.current;
    if (!element || !autoCollapse) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [autoCollapse]);
  // Same normal-control capacity model as the former owner: 36px targets plus
  // the caller's gap; floor chooses a count, never rounds any visual dimension.
  const flatCount = items.reduce(
    (count, item) =>
      count +
      (item.type === 'collapse'
        ? item.children.filter((child) => child.type !== 'divider').length
        : item.type === 'divider'
          ? 0
          : 1),
    0,
  );
  const always = items.filter((item) => item.alwaysDisplay);
  const capacity =
    width && autoCollapse
      ? Math.max(always.length + 1, Math.floor((width - collapseOffset) / (36 + gap)))
      : flatCount + 1;
  const overflow = capacity < flatCount + 1;
  const normal = items.filter((item) => !item.alwaysDisplay && item.type !== 'collapse');
  const explicit = items.filter((item) => item.type === 'collapse' && !item.alwaysDisplay);
  const visibleCount = Math.max(0, capacity - always.length - 1);

  function renderItem(item: ChatActionItem, index: number): ReactNode {
    const key = item.key ?? index;
    if (item.type === 'divider')
      return <Separator className="mx-1 h-4" key={key} orientation="vertical" />;
    if (item.type === 'dropdown')
      return (
        <ActionDropdown
          disabled={disabled || item.disabled || item.loading}
          key={key}
          menu={{ items: item.children }}
          trigger="hover"
        >
          <ActionIcon
            active={item.active}
            danger={item.danger}
            disabled={disabled || item.disabled || item.loading}
            icon={item.icon}
            loading={item.loading}
            size={{ blockSize: 36, size: 20 }}
            title={item.label}
            tooltipProps={item.tooltipProps}
          />
        </ActionDropdown>
      );
    if (item.type === 'collapse')
      return (
        <div className="flex shrink-0 items-center" key={key} style={{ gap }}>
          <div
            className={groupCollapsed ? 'hidden' : 'flex items-center'}
            hidden={groupCollapsed}
            inert={groupCollapsed}
            style={{ gap }}
          >
            {item.children.map(renderItem)}
          </div>
          <ActionIcon
            aria-expanded={!groupCollapsed}
            icon={groupCollapsed ? ChevronRight : ChevronLeft}
            size={{ blockSize: 36, size: 20 }}
            title={t('more')}
            onClick={() => setGroupCollapsed(!groupCollapsed)}
          />
        </div>
      );
    return <PlainAction disabled={disabled} item={item} key={key} onActionClick={onActionClick} />;
  }
  const hidden = [
    ...normal.slice(visibleCount).filter((item) => item.type !== 'divider'),
    ...explicit.flatMap((item) => (item.type === 'collapse' ? item.children : [])),
  ];
  return (
    <div
      {...rest}
      className={cn('flex min-w-0 flex-1 items-center', className)}
      ref={root}
      style={{ ...style, gap }}
    >
      {overflow ? (
        <>
          {normal.slice(0, visibleCount).map(renderItem)}
          <Popover>
            <PopoverTrigger
              render={
                <ActionIcon icon={ChevronUp} size={{ blockSize: 36, size: 20 }} title={t('more')} />
              }
            />
            <PopoverContent className="w-auto max-w-full flex-row flex-wrap items-center gap-0.5 p-1">
              {hidden.map(renderItem)}
            </PopoverContent>
          </Popover>
          {always.map(renderItem)}
        </>
      ) : (
        items.map(renderItem)
      )}
    </div>
  );
}
