import { createStaticStyles, cssVar, cx } from 'antd-style';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { type CSSProperties, memo, type ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';

const styles = createStaticStyles(({ css }) => ({
  hoverToActive: css`
    opacity: 0.6;

    &:hover {
      opacity: 1;
    }
  `,
  sortButton: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    padding: 0;
    border: none;

    font: inherit;
    font-weight: inherit;
    color: inherit;

    background: transparent;
  `,
  sortIcon: css`
    display: inline-flex;
    color: ${cssVar.colorTextTertiary};

    &.active {
      color: ${cssVar.colorText};
    }
  `,
  table: css`
    overflow-x: auto;

    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 13px;
    }

    th {
      padding-block: 8px;
      padding-inline: 12px;

      font-weight: 500;
      color: ${cssVar.colorTextSecondary};
      text-align: start;

      background: ${cssVar.colorFillQuaternary};
    }

    td {
      padding-block: 8px;
      padding-inline: 12px;
      vertical-align: middle;
    }

    tr {
      td:first-child,
      th:first-child {
        padding-inline-start: 24px;
      }

      td:last-child,
      th:last-child {
        padding-inline-end: 24px;
      }
    }
  `,
}));

export type InlineTableSortOrder = 'ascend' | 'descend' | null | undefined;

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
                    <span className={cx(styles.sortIcon, column.sortOrder && 'active')}>
                      {column.sortOrder === 'descend' ? (
                        <ArrowDown size={12} />
                      ) : (
                        <ArrowUp size={12} />
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
                colSpan={Math.max(columns.length, 1)}
                style={{ color: cssVar.colorTextTertiary, textAlign: 'center' }}
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
