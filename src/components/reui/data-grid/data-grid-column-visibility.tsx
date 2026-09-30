'use client';

import type { Table } from '@tanstack/react-table';
import type { ReactElement } from 'react';

import type { DataGridFeatures } from '@/components/reui/data-grid/data-grid';
import { getColumnHeaderLabel, useDataGrid } from '@/components/reui/data-grid/data-grid';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function DataGridColumnVisibility<TData extends object>({
  table,
  trigger,
}: {
  table: Table<DataGridFeatures, TData>;
  trigger: ReactElement<Record<string, unknown>>;
}) {
  const { i18n } = useDataGrid();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="min-w-[150px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-medium">{i18n.labels.toggleColumns}</DropdownMenuLabel>
          {table
            .getAllColumns()
            .filter((column) => column.getCanHide())
            .map((column) => {
              return (
                <DropdownMenuCheckboxItem
                  checked={column.getIsVisible()}
                  className="capitalize"
                  key={column.id}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {getColumnHeaderLabel(column)}
                </DropdownMenuCheckboxItem>
              );
            })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { DataGridColumnVisibility };
