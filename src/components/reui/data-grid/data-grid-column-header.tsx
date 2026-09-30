'use client';

import type { Column } from '@tanstack/react-table';
import { Subscribe } from '@tanstack/react-table';
import { cn } from 'cn';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowLeftToLineIcon,
  ArrowRightIcon,
  ArrowRightToLineIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  PinOffIcon,
  Settings2Icon,
} from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { memo, useMemo } from 'react';

import type { DataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { getColumnHeaderLabel, useDataGrid } from '@/components/reui/data-grid/data-grid';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataGridColumnHeaderProps<
  TData extends object,
  TValue,
> extends HTMLAttributes<HTMLDivElement> {
  column: Column<DataGridFeatures, TData, TValue>;
  filter?: ReactNode;
  icon?: ReactNode;
  /** Reserved; pin controls are gated by tableLayout.columnsPinnable + column.getCanPin(). */
  pinnable?: boolean;
  /** When omitted, uses `column.columnDef.meta.headerTitle`, then a string `columnDef.header`, then `column.id`. */
  title?: string;
  visibility?: boolean;
}

function DataGridColumnHeaderInner<TData extends object, TValue>({
  column,
  title,
  icon,
  className,
  filter,
  visibility = false,
}: DataGridColumnHeaderProps<TData, TValue>) {
  const { i18n, isLoading, table, props } = useDataGrid();
  const resolvedTitle = title ?? getColumnHeaderLabel(column);

  // The order a move rewrites: the consumer's columnOrder (TanStack defaults it
  // to []), then every leaf it leaves out, in definition order - the same
  // completion TanStack applies when rendering, so a rendered neighbour is
  // always present to re-seat beside, even after columns are added later.
  const columnOrderState = table.state.columnOrder;
  const definitionOrder = table
    .getAllColumns()
    .flatMap((topColumn) => topColumn.getLeafColumns())
    .map((leafColumn) => leafColumn.id);
  const columnOrder = [
    ...columnOrderState,
    ...definitionOrder.filter((id) => !columnOrderState.includes(id)),
  ];
  const columnVisibilityKey =
    props.tableLayout?.columnsVisibility && visibility
      ? JSON.stringify(table.state.columnVisibility)
      : '';
  const isSorted = column.getIsSorted();
  const isPinned = column.getIsPinned();
  const canSort = column.getCanSort();
  const canPin = column.getCanPin();
  const canResize = column.getCanResize();

  // Move neighbours come from what is RENDERED: the column's own pin bucket,
  // visible columns only. Stepping through the raw columnOrder would trade
  // places with a hidden or pinned column - an enabled click that moves nothing.
  // With grouping in TanStack's default "reorder" mode, grouped columns render
  // first whatever columnOrder says: they neither move nor serve as a target.
  const groupedColumnMode = (table.options as { groupedColumnMode?: false | 'reorder' | 'remove' })
    .groupedColumnMode;
  const isHoistedByGrouping = (target: object) =>
    groupedColumnMode !== false &&
    typeof (target as { getIsGrouped?: unknown }).getIsGrouped === 'function' &&
    (target as { getIsGrouped: () => boolean }).getIsGrouped();
  const renderedPeers = (
    isPinned === 'start'
      ? table.getStartVisibleLeafColumns()
      : isPinned === 'end'
        ? table.getEndVisibleLeafColumns()
        : table.getCenterVisibleLeafColumns()
  )
    .filter((leafColumn) => !isHoistedByGrouping(leafColumn))
    .map((leafColumn) => leafColumn.id);
  const renderedIndex = renderedPeers.indexOf(column.id);
  const leftNeighbour = renderedIndex > 0 ? renderedPeers[renderedIndex - 1] : undefined;
  const rightNeighbour =
    renderedIndex !== -1 && renderedIndex < renderedPeers.length - 1
      ? renderedPeers[renderedIndex + 1]
      : undefined;
  const canMoveLeft = leftNeighbour !== undefined;
  const canMoveRight = rightNeighbour !== undefined;

  /** Re-seats this column beside a rendered neighbour; every other column,
   * hidden or pinned ones included, keeps its place in the full order. */
  const moveBeside = (neighbourId: string, side: 'before' | 'after') => {
    const newOrder = columnOrder.filter((id) => id !== column.id);
    const at = newOrder.indexOf(neighbourId);
    if (at === -1) return;
    newOrder.splice(side === 'before' ? at : at + 1, 0, column.id);
    table.setColumnOrder(newOrder);
  };

  const handleSort = () => {
    if (isSorted === 'asc') {
      column.toggleSorting(true);
    } else if (isSorted === 'desc') {
      column.clearSorting();
    } else {
      column.toggleSorting(false);
    }
  };

  const headerLabelClassName = cn(
    'text-secondary-foreground/80 inline-flex h-full items-center gap-1.5 font-normal [&_svg]:opacity-60 text-[0.8125rem] leading-[calc(1.125/0.8125)] [&_svg]:size-3.5',
    className,
  );

  const headerButtonClassName = cn(
    'text-secondary-foreground/80 hover:bg-secondary data-[state=open]:bg-secondary hover:text-foreground data-[state=open]:text-foreground px-2 font-normal h-6 rounded-lg',
    className,
  );

  const sortIcon =
    canSort &&
    (isSorted === 'desc' ? (
      <ArrowDownIcon aria-hidden="true" className="size-3.25" />
    ) : isSorted === 'asc' ? (
      <ArrowUpIcon aria-hidden="true" className="size-3.25" />
    ) : (
      <ChevronsUpDownIcon aria-hidden="true" className="mt-px size-3.25" />
    ));

  const hasControls =
    props.tableLayout?.columnsMovable ||
    (props.tableLayout?.columnsVisibility && visibility) ||
    (props.tableLayout?.columnsPinnable && canPin) ||
    filter;

  const menuItems = useMemo(() => {
    const items: ReactNode[] = [];
    let hasPreviousSection = false;

    // Filter section
    if (filter) {
      items.push(
        <DropdownMenuGroup key="group-filter">
          <DropdownMenuLabel key="filter">{filter}</DropdownMenuLabel>
        </DropdownMenuGroup>,
      );
      hasPreviousSection = true;
    }

    // Sort section
    if (canSort) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-sort" />);
      }
      items.push(
        <DropdownMenuItem
          disabled={!canSort}
          key="sort-asc"
          onClick={() => {
            if (isSorted === 'asc') {
              column.clearSorting();
            } else {
              column.toggleSorting(false);
            }
          }}
        >
          <ArrowUpIcon className="size-3.5!" />
          <span className="grow">{i18n.labels.sortAscending}</span>
          {isSorted === 'asc' && <CheckIcon className="text-primary size-4 opacity-100!" />}
        </DropdownMenuItem>,
        <DropdownMenuItem
          disabled={!canSort}
          key="sort-desc"
          onClick={() => {
            if (isSorted === 'desc') {
              column.clearSorting();
            } else {
              column.toggleSorting(true);
            }
          }}
        >
          <ArrowDownIcon className="size-3.5!" />
          <span className="grow">{i18n.labels.sortDescending}</span>
          {isSorted === 'desc' && <CheckIcon className="text-primary size-4 opacity-100!" />}
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Pin section
    if (props.tableLayout?.columnsPinnable && canPin) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-pin" />);
      }
      items.push(
        <DropdownMenuItem
          key="pin-left"
          onClick={() => column.pin(isPinned === 'start' ? false : 'start')}
        >
          <ArrowLeftToLineIcon aria-hidden="true" className="size-3.5!" />
          <span className="grow">{i18n.labels.pinColumnStart}</span>
          {isPinned === 'start' && <CheckIcon className="text-primary size-4 opacity-100!" />}
        </DropdownMenuItem>,
        <DropdownMenuItem
          key="pin-right"
          onClick={() => column.pin(isPinned === 'end' ? false : 'end')}
        >
          <ArrowRightToLineIcon aria-hidden="true" className="size-3.5!" />
          <span className="grow">{i18n.labels.pinColumnEnd}</span>
          {isPinned === 'end' && <CheckIcon className="text-primary size-4 opacity-100!" />}
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Move section
    if (props.tableLayout?.columnsMovable) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-move" />);
      }
      items.push(
        <DropdownMenuItem
          disabled={!canMoveLeft || isPinned !== false}
          key="move-left"
          onClick={() => {
            if (leftNeighbour) moveBeside(leftNeighbour, 'before');
          }}
        >
          <ArrowLeftIcon aria-hidden="true" className="size-3.5!" />
          <span>{i18n.labels.moveColumnStart}</span>
        </DropdownMenuItem>,
        <DropdownMenuItem
          disabled={!canMoveRight || isPinned !== false}
          key="move-right"
          onClick={() => {
            if (rightNeighbour) moveBeside(rightNeighbour, 'after');
          }}
        >
          <ArrowRightIcon aria-hidden="true" className="size-3.5!" />
          <span>{i18n.labels.moveColumnEnd}</span>
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Visibility section
    if (props.tableLayout?.columnsVisibility && visibility) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-visibility" />);
      }
      items.push(
        <DropdownMenuSub key="visibility">
          <DropdownMenuSubTrigger>
            <Settings2Icon className="size-3.5!" />
            <span>{i18n.labels.columnsMenu}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent side="right">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  checked={col.getIsVisible()}
                  className="capitalize"
                  key={col.id}
                  onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {getColumnHeaderLabel(col)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>,
      );
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filter,
    canSort,
    isSorted,
    column,
    props.tableLayout?.columnsPinnable,
    props.tableLayout?.columnsMovable,
    props.tableLayout?.columnsVisibility,
    canPin,
    isPinned,
    canMoveLeft,
    canMoveRight,
    visibility,
    table,
    leftNeighbour,
    rightNeighbour,
    columnOrder,
    columnVisibilityKey, // Needed to update checkbox states when visibility changes
  ]);

  if (hasControls) {
    return (
      <div className="-ms-2 flex h-full items-center justify-between gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className={headerButtonClassName} disabled={isLoading} variant="ghost">
                {icon && icon}
                {resolvedTitle}
                {sortIcon}
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-40">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
        {props.tableLayout?.columnsPinnable && canPin && isPinned && (
          <Button
            aria-label={i18n.labels.unpinColumn(resolvedTitle)}
            className="rounded-lg -me-1 size-7"
            size="icon-sm"
            title={i18n.labels.unpinColumn(resolvedTitle)}
            variant="ghost"
            onClick={() => column.pin(false)}
          >
            <PinOffIcon aria-hidden="true" className="size-3.5! opacity-50!" />
          </Button>
        )}
      </div>
    );
  }

  if (canSort || (props.tableLayout?.columnsResizable && canResize)) {
    return (
      <div className="-ms-2 flex h-full items-center">
        <Button
          className={headerButtonClassName}
          disabled={isLoading}
          variant="ghost"
          onClick={handleSort}
        >
          {icon && icon}
          {resolvedTitle}
          {sortIcon}
        </Button>
      </div>
    );
  }

  return (
    <div className={headerLabelClassName}>
      {icon && icon}
      {resolvedTitle}
    </div>
  );
}

const DataGridColumnHeaderMemo = memo(DataGridColumnHeaderInner) as <TData extends object, TValue>(
  props: DataGridColumnHeaderProps<TData, TValue> & {
    /** Internal: the state slices the header re-renders on. Not part of the public API. */
    subscribedState?: unknown;
  },
) => ReactNode;

/**
 * Sort and pin state reaches this header through builder calls on `column`
 * (`getIsSorted()`, `getIsPinned()`), and `column` is a stable reference. That
 * combination is the one v9's fresh-table-per-state-change does NOT cover:
 * React Compiler is free to memoize against the stable column and never
 * re-evaluate those reads, which shows up as frozen sort arrows and pin
 * controls. The `Subscribe` below turns the slices this header actually reads
 * into a real reactive dependency, and threading the selection through as a
 * prop is what lets it past the `memo` - which would otherwise see unchanged
 * props and skip the render anyway.
 */
function DataGridColumnHeader<TData extends object, TValue>(
  props: DataGridColumnHeaderProps<TData, TValue>,
) {
  const { table } = useDataGrid();

  return (
    <Subscribe
      source={table.store}
      selector={(state) => ({
        sorting: state.sorting,
        columnPinning: state.columnPinning,
        columnOrder: state.columnOrder,
        columnVisibility: state.columnVisibility,
      })}
    >
      {(subscribed) => <DataGridColumnHeaderMemo {...props} subscribedState={subscribed} />}
    </Subscribe>
  );
}

export { DataGridColumnHeader, type DataGridColumnHeaderProps };
