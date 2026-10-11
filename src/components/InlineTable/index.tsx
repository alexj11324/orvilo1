import { cx } from 'antd-style';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { type CSSProperties, memo, type ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';

import { type InlineTableSortOrder, sortIconActiveClass } from './sortOrder';

const styles = {
  hoverToActive: 'opacity-60 hover:opacity-100 focus-within:opacity-100',
  sortButton:
    'inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-(--radius-input) border-0 bg-transparent p-0 [font:inherit] [font-weight:inherit] text-inherit focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  sortIcon: 'inline-flex text-foreground-tertiary [&.active]:text-foreground',
  table:
    'overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:leading-5.5 [&_th]:bg-fill-quaternary [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle [&_tr>:is(td,th):first-child]:ps-6 [&_tr>:is(td,th):last-child]:pe-6',
};

export type { InlineTableSortOrder };

export interface InlineTableColumn<RecordType = any> {
  align?: 'center' | 'end' | 'left' | 'right' | 'start';
  dataIndex?: string | string[];
  key?: string;
  render?: (value: any, record: RecordType, index: number) => ReactNode;
  sorter?: boolean;
  sortOrder?: InlineTableSortOrder;
  title?: ReactNode;
  width?: number | string;
}

export interface InlineTableSorter {
  columnKey?: string;
  order?: 'ascend' | 'descend';
}

export interface InlineTableProps<RecordType = any> {
  className?: string;
  columns?: InlineTableColumn<RecordType>[];
  dataSource?: RecordType[];
  hoverToActive?: boolean;
  loading?: boolean;
  onChange?: (pagination: null, filters: null, sorter: InlineTableSorter) => void;
  pagination?: false | unknown;
  rowKey?: keyof RecordType | ((record: RecordType) => string);
  scroll?: { x?: string | number };
  size?: 'large' | 'middle' | 'small';
  style?: CSSProperties;
}

const getValue = (record: any, dataIndex?: string | string[]) => {
  if (!dataIndex) return undefined;
  const path = Array.isArray(dataIndex) ? dataIndex : String(dataIndex).split('.');
  return path.reduce((acc, key) => (acc == null ? acc : acc[key]), record);
};

const getRowKey = <RecordType,>(
  record: RecordType,
  rowKey: InlineTableProps<RecordType>['rowKey'],
  index: number,
) => {
  if (typeof rowKey === 'function') return rowKey(record);
  if (rowKey) return String(getValue(record, rowKey as string) ?? index);
  return String(getValue(record, 'id') ?? getValue(record, 'key') ?? index);
};

const InlineTable = memo(<RecordType,>(props: InlineTableProps<RecordType>) => {
  const {
    hoverToActive,
    className,
    columns = [],
    dataSource = [],
    loading,
    onChange,
    rowKey,
    style,
  } = props;

  const handleSort = (column: InlineTableColumn<RecordType>) => {
    if (!column.sorter) return;
    const columnKey = column.key ?? (typeof column.dataIndex === 'string' ? column.dataIndex : '');
    const current = column.sortOrder;
    const nextOrder =
      current === 'ascend' ? 'descend' : current === 'descend' ? undefined : 'ascend';
    onChange?.(null, null, { columnKey, order: nextOrder });
  };

  return (
    <div
      className={cx(styles.table, hoverToActive && styles.hoverToActive, className)}
      style={style}
    >
      <table>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                className={cx(column.align === 'end' || column.align === 'right' ? 'text-end' : '')}
                key={column.key ?? index}
                style={{ textAlign: column.align, width: column.width }}
              >
                {column.sorter ? (
                  <button
                    className={styles.sortButton}
                    type="button"
                    onClick={() => handleSort(column)}
                  >
                    {column.title}
                    <span className={cx(styles.sortIcon, sortIconActiveClass(column.sortOrder))}>
                      {column.sortOrder === 'descend' ? (
                        <ArrowDown className="size-4" size={16} />
                      ) : (
                        <ArrowUp className="size-4" size={16} />
                      )}
                    </span>
                  </button>
                ) : (
                  column.title
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)} style={{ textAlign: 'center' }}>
                <Spinner />
              </td>
            </tr>
          ) : dataSource.length === 0 ? (
            <tr>
              <td
                className="text-center text-foreground-tertiary"
                colSpan={Math.max(columns.length, 1)}
              >
                No data
              </td>
            </tr>
          ) : (
            dataSource.map((record, index) => (
              <tr key={getRowKey(record, rowKey, index)}>
                {columns.map((column, columnIndex) => {
                  const value = getValue(record, column.dataIndex);
                  return (
                    <td
                      key={column.key ?? columnIndex}
                      style={{ textAlign: column.align, width: column.width }}
                      className={cx(
                        column.align === 'end' || column.align === 'right' ? 'text-end' : '',
                      )}
                    >
                      {column.render ? column.render(value, record, index) : value}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}) as <RecordType = any>(props: InlineTableProps<RecordType>) => ReactNode;

export default InlineTable;
