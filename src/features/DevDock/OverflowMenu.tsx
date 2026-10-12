'use client';

import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import { Ellipsis, Pin } from 'lucide-react';
import { memo } from 'react';

import type { DropdownItem } from '@/components/ItemsMenu';
import { DropdownMenu } from '@/components/ItemsMenu';
import { Button } from '@/components/ui/button';

import {
  type DevDockItem,
  type DevDockSelectItem,
  isItemPinned,
  useDevDockItems,
} from './registry';
import { useDevDockStore } from './store';

const PIN_CLASS = 'devdock-pin';

const itemIcon = (Icon: LucideIcon) => <Icon size={16} />;

const styles = {
  pinButton:
    'cursor-pointer inline-flex items-center justify-center size-8 p-0 border-0 rounded-(--radius-button) text-foreground-quaternary bg-transparent hover:text-foreground hover:bg-accent data-[pinned=true]:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  popup:
    "min-w-56 [&_.devdock-pin]:opacity-0 [&_[role^='menuitem']:hover_.devdock-pin]:opacity-100 [&_.devdock-pin:focus-visible]:opacity-100 [&_.devdock-pin[data-pinned='true']]:opacity-100",
  submenuLabel: 'inline-flex gap-2 items-center',
  trigger:
    'cursor-pointer inline-flex items-center justify-center size-8 border-0 rounded-(--radius-button) text-foreground-tertiary bg-transparent hover:text-foreground hover:bg-accent data-popup-open:text-foreground data-popup-open:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  valueHint: 'font-mono text-xs leading-5 text-foreground-tertiary',
};

const PinToggle = memo<{ item: DevDockItem }>(({ item }) => {
  const pinned = useDevDockStore((s) => isItemPinned(item, s.pinOverrides));
  const setPinned = useDevDockStore((s) => s.setPinned);
  return (
    <Button
      className={cn(PIN_CLASS, styles.pinButton)}
      data-pinned={pinned}
      size="icon"
      title={pinned ? 'Unpin from bar' : 'Pin to bar'}
      type={'button'}
      variant="ghost"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPinned(item.id, !pinned);
      }}
    >
      <Pin fill={pinned ? 'currentColor' : 'none'} size={16} />
    </Button>
  );
});

PinToggle.displayName = 'DevDockPinToggle';

const buildSelectSubmenu = (item: DevDockSelectItem): DropdownItem => ({
  children: item.getOptions().map((option) => ({
    checked: item.getValue() === option.value,
    closeOnClick: true,
    key: option.value,
    label: option.label,
    onCheckedChange: (checked: boolean) => {
      if (checked) item.onSelect(option.value);
    },
    type: 'checkbox' as const,
  })),
  icon: itemIcon(item.icon),
  key: item.id,
  label: (
    <span className={styles.submenuLabel}>
      {item.label}
      <span className={styles.valueHint}>{item.getValue()}</span>
      <PinToggle item={item} />
    </span>
  ),
  type: 'submenu' as const,
});

const OverflowMenu = memo(() => {
  const items = useDevDockItems();

  const buildItems = (): DropdownItem[] => {
    const { setPinned, togglePanel } = useDevDockStore.getState();
    const pinned = (item: DevDockItem) =>
      isItemPinned(item, useDevDockStore.getState().pinOverrides);

    const groups: DropdownItem[] = [];

    const panels = items.filter((item) => item.type === 'panel');
    if (panels.length > 0)
      groups.push({
        children: panels.map((item) => ({
          extra: <PinToggle item={item} />,
          icon: itemIcon(item.icon),
          key: item.id,
          label: item.label,
          onClick: () => togglePanel(item.id),
        })),
        label: 'Panels',
        type: 'group' as const,
      });

    const toggles = items.filter((item) => item.type === 'toggle');
    if (toggles.length > 0)
      groups.push({
        children: toggles.map((item) => ({
          closeOnClick: false,
          defaultChecked: item.getChecked(),
          extra: <PinToggle item={item} />,
          icon: itemIcon(item.icon),
          key: item.id,
          label: item.label,
          onCheckedChange: item.onToggle,
          type: 'switch' as const,
        })),
        label: 'Toggles',
        type: 'group' as const,
      });

    const actions = items.filter((item) => item.type === 'action');
    if (actions.length > 0)
      groups.push({
        children: actions.map((item) => ({
          extra: <PinToggle item={item} />,
          icon: itemIcon(item.icon),
          key: item.id,
          label: item.label,
          onClick: item.onTrigger,
        })),
        label: 'Actions',
        type: 'group' as const,
      });

    const readouts = items.filter((item) => item.type === 'readout');
    if (readouts.length > 0)
      groups.push({
        children: readouts.map((item) => ({
          closeOnClick: false,
          extra: <PinToggle item={item} />,
          icon: itemIcon(item.icon),
          key: item.id,
          label: item.label,
          onClick: () => setPinned(item.id, !pinned(item)),
        })),
        label: 'Metrics',
        type: 'group' as const,
      });

    const selects = items.filter((item) => item.type === 'select');
    if (selects.length > 0) {
      groups.push({ type: 'divider' as const }, ...selects.map(buildSelectSubmenu));
    }

    return groups;
  };

  return (
    <DropdownMenu items={buildItems} placement={'topRight'} popupClassName={styles.popup}>
      <Button
        className={styles.trigger}
        size="icon"
        title={'More tools'}
        type={'button'}
        variant="ghost"
      >
        <Ellipsis size={16} />
      </Button>
    </DropdownMenu>
  );
});

OverflowMenu.displayName = 'DevDockOverflowMenu';

export default OverflowMenu;
