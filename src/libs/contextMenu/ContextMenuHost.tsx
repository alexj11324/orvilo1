'use client';

import { cn } from 'cn';
import {
  type ComponentProps,
  createElement,
  type ElementType,
  isValidElement,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

import { getFloatingCollisionPadding } from './collisionPadding';
import {
  closeContextMenu,
  getServerSnapshot,
  getSnapshot,
  subscribe,
  updateLastPointer,
} from './webStore';
import type {
  ContextMenuItem as Item,
  ContextMenuItemData,
  ShowContextMenuOptions,
} from './webTypes';

const hasIcon = (items: Item[], recurse = true): boolean =>
  items.some((item) =>
    Boolean(
      item && (item.icon || item.loading || (recurse && item.children && hasIcon(item.children))),
    ),
  );
const content = (item: ContextMenuItemData, reserve: boolean, options: ShowContextMenuOptions) => (
  <>
    {(reserve || item.icon || item.loading) && (
      <span
        className={cn(
          'flex w-4 shrink-0 justify-center',
          options.iconAlign === 'start' ? 'self-start' : 'self-center',
        )}
      >
        {item.loading ? (
          <Spinner />
        ) : item.icon ? (
          isValidElement(item.icon) ? (
            item.icon
          ) : (
            createElement(item.icon as ElementType, { 'aria-hidden': true })
          )
        ) : null}
      </span>
    )}
    <span className="flex min-w-0 flex-1 flex-col">
      <span>{item.label ?? item.title}</span>
      {item.desc != null && <span className="text-xs text-muted-foreground">{item.desc}</span>}
    </span>
    {item.extra != null && (
      <span className="ml-auto text-xs text-muted-foreground">{item.extra}</span>
    )}
  </>
);
function SwitchItem({
  item,
  reserve,
  options,
}: {
  item: ContextMenuItemData;
  reserve: boolean;
  options: ShowContextMenuOptions;
}) {
  const [checked, setChecked] = useState(item.defaultChecked ?? false);
  const value = item.checked ?? checked;
  return (
    <ContextMenuItem
      closeOnClick={item.closeOnClick ?? false}
      disabled={item.disabled}
      variant={item.danger ? 'destructive' : 'default'}
      onClick={() => {
        if (item.checked === undefined) setChecked(!value);
        item.onCheckedChange?.(!value);
      }}
    >
      {content(item, reserve, options)}
      <Switch
        checked={value}
        className="pointer-events-none ml-auto"
        disabled={item.disabled}
        size="sm"
      />
    </ContextMenuItem>
  );
}
function Items({
  items,
  path = [],
  options,
  globalReserve,
}: {
  items: Item[];
  path?: string[];
  options: ShowContextMenuOptions;
  globalReserve: boolean;
}) {
  const reserve = options.iconSpaceMode === 'group' ? hasIcon(items, false) : globalReserve;
  return items.map((item, index) => {
    if (!item) return null;
    const key = String(item.key ?? `${path.join('.')}:${index}`);
    const keyPath = [...path, key];
    if (item.type === 'divider') return <ContextMenuSeparator key={key} />;
    if (item.type === 'group')
      return (
        <ContextMenuGroup key={key}>
          {item.label != null && <ContextMenuLabel>{item.label}</ContextMenuLabel>}
          <Items
            globalReserve={globalReserve}
            items={item.children ?? []}
            options={options}
            path={keyPath}
          />
        </ContextMenuGroup>
      );
    if (item.type === 'checkbox')
      return (
        <ContextMenuCheckboxItem
          checked={item.checked}
          closeOnClick={item.closeOnClick}
          defaultChecked={item.defaultChecked}
          disabled={item.disabled}
          key={key}
          onCheckedChange={item.onCheckedChange}
        >
          {content(item, reserve, options)}
        </ContextMenuCheckboxItem>
      );
    if (item.type === 'switch')
      return <SwitchItem item={item} key={key} options={options} reserve={reserve} />;
    if (item.type === 'submenu' || item.children)
      return (
        <ContextMenuSub
          defaultOpen={item.defaultOpen}
          key={key}
          open={item.open}
          onOpenChange={item.onOpenChange}
        >
          <ContextMenuSubTrigger
            {...item.triggerProps}
            closeDelay={item.closeDelay}
            delay={item.delay}
            disabled={item.disabled}
            openOnHover={item.openOnHover}
            onPointerEnter={(event) => item.onTitleMouseEnter?.({ domEvent: event, key })}
            onClick={(event) => {
              item.triggerProps?.onClick?.(event);
              item.onClick?.({ domEvent: event, item: event.currentTarget, key, keyPath });
            }}
          >
            {content(item, reserve, options)}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {item.header != null && (
              <div className="sticky top-0 border-b border-divider bg-popover p-2">
                {item.header}
              </div>
            )}
            <Items
              globalReserve={globalReserve}
              items={item.children ?? []}
              options={options}
              path={keyPath}
            />
            {item.footer != null && (
              <div className="sticky bottom-0 border-t border-divider bg-popover p-2">
                {item.footer}
              </div>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    const label = item.label ?? item.title;
    const isLink =
      isValidElement<ComponentProps<'a'> & { to?: string }>(label) &&
      (label.props.href !== undefined || label.props.to !== undefined);
    const link = isLink
      ? createElement(label.type, { ...label.props, children: undefined })
      : undefined;
    const displayed = isLink ? { ...item, label: label.props.children } : item;
    return (
      <ContextMenuItem
        closeOnClick={item.closeOnClick}
        disabled={item.disabled || item.loading}
        key={key}
        render={link}
        variant={item.danger ? 'destructive' : 'default'}
        onClick={(event) =>
          item.onClick?.({ domEvent: event, item: event.currentTarget, key, keyPath })
        }
      >
        {content(displayed, reserve, options)}
      </ContextMenuItem>
    );
  });
}

export function ContextMenuHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    window.addEventListener('pointerdown', updateLastPointer, true);
    window.addEventListener('contextmenu', updateLastPointer, true);
    return () => {
      window.removeEventListener('pointerdown', updateLastPointer, true);
      window.removeEventListener('contextmenu', updateLastPointer, true);
    };
  }, []);
  if (!state.open || !state.point) return null;
  const { x, y } = state.point;
  const anchor = { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) };
  return (
    <ContextMenu
      open={state.open}
      onOpenChange={(open) => {
        if (!open) closeContextMenu();
      }}
    >
      <ContextMenuContent
        anchor={anchor}
        collisionPadding={getFloatingCollisionPadding()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {state.header != null && (
          <div className="sticky top-0 border-b border-divider bg-popover p-2">{state.header}</div>
        )}
        <Items globalReserve={hasIcon(state.items)} items={state.items} options={state} />
        {state.footer != null && (
          <div className="sticky bottom-0 border-t border-divider bg-popover p-2">
            {state.footer}
          </div>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
export default ContextMenuHost;
