import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from 'cn';
import {
  createElement,
  type ElementType,
  isValidElement,
  type MouseEvent,
  type ReactNode,
} from 'react';

import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { POPUP_Z_CLASS } from '@/components/ui/zIndex';

/**
 * The menu-item union `renderDropdownMenuItems` accepted (Base UI's
 * `BaseMenuItemType`): plain items, `submenu` (header/footer slots), `group`,
 * `divider`, `checkbox` and `switch` rows.
 */
export interface MenuInfo {
  domEvent: MouseEvent;
  item: EventTarget & Element;
  key: string;
  keyPath: string[];
}

export interface ActionMenuItem {
  checked?: boolean;
  children?: ActionMenuItem[];
  className?: string;
  closeOnClick?: boolean;
  danger?: boolean;
  defaultChecked?: boolean;
  defaultOpen?: boolean;
  desc?: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  icon?: ElementType | ReactNode;
  key?: string;
  label?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
  onClick?: (info: MenuInfo) => void;
  onOpenChange?: (open: boolean, details?: { cancel?: () => void; reason?: string }) => void;
  open?: boolean;
  openOnHover?: boolean;
  type?: 'checkbox' | 'divider' | 'group' | 'submenu' | 'switch';
}

const getItemLabel = (item: ActionMenuItem): ReactNode => item.label;

const renderItemIcon = (icon: ActionMenuItem['icon']) => {
  if (!icon) return null;
  return isValidElement(icon) ? icon : createElement(icon as ElementType);
};

const ItemContent = ({
  extra,
  icon,
  label,
  desc,
}: {
  desc?: ReactNode;
  extra?: ReactNode;
  icon?: ActionMenuItem['icon'];
  label?: ReactNode;
}) => (
  <>
    {renderItemIcon(icon)}
    {desc != null ? (
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{desc}</span>
      </span>
    ) : (
      <span className="min-w-0 flex-1">{label}</span>
    )}
    {extra ? <span className="ml-auto flex items-center">{extra}</span> : null}
  </>
);

export const renderMenuItems = (items: ActionMenuItem[], keyPath: string[] = []) =>
  items.map((item, index) => {
    if (!item) return null;

    const itemKey = item.key ?? `${keyPath.join('-') || 'root'}-${index}`;
    const nextKeyPath = [...keyPath, String(itemKey)];

    if (item.type === 'divider') return <DropdownMenuSeparator key={itemKey} />;

    if (item.type === 'group')
      return (
        <DropdownMenuGroup key={itemKey}>
          {item.label ? <DropdownMenuLabel>{item.label}</DropdownMenuLabel> : null}
          {item.children ? renderMenuItems(item.children, nextKeyPath) : null}
        </DropdownMenuGroup>
      );

    if (item.type === 'checkbox')
      return (
        <DropdownMenuCheckboxItem
          checked={item.checked}
          closeOnClick={item.closeOnClick}
          defaultChecked={item.defaultChecked}
          disabled={item.disabled}
          key={itemKey}
          variant={item.danger ? 'destructive' : 'default'}
          onCheckedChange={(checked) => item.onCheckedChange?.(checked)}
        >
          <ItemContent
            desc={item.desc}
            extra={item.extra}
            icon={item.icon}
            label={getItemLabel(item)}
          />
        </DropdownMenuCheckboxItem>
      );

    if (item.type === 'switch')
      return (
        <DropdownMenuItem
          className={cn(item.className)}
          closeOnClick={item.closeOnClick ?? false}
          disabled={item.disabled}
          key={itemKey}
          variant={item.danger ? 'destructive' : 'default'}
          onClick={(event) => {
            if (!item.disabled) item.onCheckedChange?.(!(item.checked ?? item.defaultChecked));
            event.stopPropagation();
          }}
        >
          {renderItemIcon(item.icon)}
          <span className="min-w-0 flex-1">{getItemLabel(item)}</span>
          {item.extra}
          <Switch
            checked={item.checked}
            className="pointer-events-none ml-auto"
            defaultChecked={item.defaultChecked}
            disabled={item.disabled}
            size="sm"
          />
        </DropdownMenuItem>
      );

    if (item.type === 'submenu' || 'children' in item)
      return (
        <DropdownMenuSub
          defaultOpen={item.defaultOpen}
          key={itemKey}
          open={item.open}
          onOpenChange={item.onOpenChange}
        >
          <DropdownMenuSubTrigger
            disabled={item.disabled}
            onClick={
              item.onClick
                ? (event) =>
                    item.onClick?.({
                      domEvent: event,
                      item: event.currentTarget,
                      key: String(itemKey),
                      keyPath: nextKeyPath,
                    })
                : undefined
            }
          >
            <ItemContent
              desc={item.desc}
              extra={item.extra}
              icon={item.icon}
              label={getItemLabel(item)}
            />
          </DropdownMenuSubTrigger>
          <MenuPrimitive.Portal>
            <MenuPrimitive.Positioner
              data-submenu
              align={'start'}
              alignOffset={-4}
              className={cn('isolate outline-none', POPUP_Z_CLASS)}
              side={'right'}
              sideOffset={-1}
            >
              <MenuPrimitive.Popup
                className={cn(
                  POPUP_Z_CLASS,
                  'cn-menu-target cn-menu-translucent w-auto min-w-[96px] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-[side=right]:slide-in-from-left-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
                )}
              >
                {item.header != null && <div className="px-1.5 py-1">{item.header}</div>}
                {item.children ? renderMenuItems(item.children, nextKeyPath) : null}
                {item.footer != null && <div className="px-1.5 py-1">{item.footer}</div>}
              </MenuPrimitive.Popup>
            </MenuPrimitive.Positioner>
          </MenuPrimitive.Portal>
        </DropdownMenuSub>
      );

    return (
      <DropdownMenuItem
        className={cn(item.className)}
        closeOnClick={item.closeOnClick}
        disabled={item.disabled}
        key={itemKey}
        variant={item.danger ? 'destructive' : 'default'}
        onClick={(event) =>
          item.onClick?.({
            domEvent: event,
            item: event.currentTarget,
            key: String(itemKey),
            keyPath: nextKeyPath,
          })
        }
      >
        <ItemContent
          desc={item.desc}
          extra={item.extra}
          icon={item.icon}
          label={getItemLabel(item)}
        />
      </DropdownMenuItem>
    );
  });
