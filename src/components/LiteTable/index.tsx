import { Skeleton } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { type ReactNode } from 'react';
import { memo } from 'react';

const LIST_BREAKPOINT = 600;

/** Placeholder rows shown before the first load settles. */
const SKELETON_ROWS = 4;

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    overflow-x: auto;
  `,
  clickableRow: css`
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -2px;
    }
  `,
  container: css`
    container-type: inline-size;
  `,
  table: css`
    border-collapse: collapse;
    width: 100%;
    min-width: max-content;
    font-size: 13px;

    th,
    td {
      padding-block: 8px;
      padding-inline: 8px;
      text-align: start;
      vertical-align: middle;
    }

    thead th {
      font-weight: 500;
      color: ${cssVar.colorTextSecondary};
      white-space: nowrap;
      background: ${cssVar.colorFillQuaternary};
    }

    tr {
      th:first-child,
      td:first-child {
        padding-inline-start: 24px;
      }

      th:last-child,
      td:last-child {
        padding-inline-end: 24px;
      }
    }

    tbody tr:hover {
      background: ${cssVar.colorFillQuaternary};
    }

    /* Section header/footer rows span the full width and never highlight. */
    tbody tr[data-list-section]:hover {
      background: transparent;
    }

    @container (max-width: ${LIST_BREAKPOINT}px) {
      display: block;
      min-width: 0;

      thead {
        display: none;
      }

      tbody {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-inline: 16px;
      }

      tbody tr {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;

        padding-block: 4px 8px;
        padding-inline: 16px;
        border: 1px solid ${cssVar.colorBorderSecondary};
        border-radius: ${cssVar.borderRadiusLG};

        &:hover {
          background: transparent;
        }
      }

      td {
        display: flex;
        grid-column: 1 / -1;
        gap: 16px;
        align-items: center;
        justify-content: space-between;

        padding-block: 6px;
        padding-inline: 0 !important;
      }

      td[data-label]::before {
        content: attr(data-label);
        flex-shrink: 0;
        color: ${cssVar.colorTextSecondary};
      }

      td:not([data-label], [data-list-slot]) {
        justify-content: flex-end;
      }

      td[data-list-slot='title'] {
        grid-column: 1;
        grid-row: 1;
        justify-content: flex-start;

        padding-block: 8px;
        border-block-end: 1px solid ${cssVar.colorBorderSecondary};

        font-size: 14px;
        font-weight: 600;
      }

      td[data-list-slot='extra'] {
        grid-column: 2;
        grid-row: 1;
        justify-content: flex-end;

        padding-block: 8px;
        border-block-end: 1px solid ${cssVar.colorBorderSecondary};
      }

      td[data-list-slot='actions'] {
        justify-content: flex-end;
      }

      /* Section header/footer rows stay plain full-width rows — they never
         become cards. */
      tbody tr[data-list-section] {
        display: block;
        padding: 0;
        border: none;
        border-radius: 0;

        &:hover {
          background: transparent;
        }
      }

      tbody tr[data-list-section] td {
        display: block;
        padding-block: 0;
        padding-inline: 16px !important;
        border-block-end: none;
      }
    }
  `,
}));

export interface LiteTableColumn<RecordType> {
  key: string;
  listLabel?: string | false;
  listSlot?: 'actions' | 'extra' | 'title';
  render: (record: RecordType, index: number) => ReactNode;
  title: ReactNode;
  width?: number | string;
}

/**
 * A labelled slice of one table. Sections share the single `<thead>` above
 * them, so column widths never drift between groups — the reference Views
 * directory renders one header over several visibility sections.
 */
export interface LiteTableSection<RecordType> {
  /** Full-width row rendered after the section's records (e.g. a create entry). */
  footer?: ReactNode;
  /** Full-width row rendered above the section's records (e.g. a group label). */
  header?: ReactNode;
  items: RecordType[];
  key: string;
}

export interface LiteTableProps<RecordType> {
  className?: string;
  columns: LiteTableColumn<RecordType>[];
  dataSource?: RecordType[];
  emptyText?: ReactNode;
  loading?: boolean;
  /**
   * Makes every data row clickable. Interactive cell content (buttons,
   * switches, editable cells) must stopPropagation to keep working.
   */
  onRowClick?: (record: RecordType) => void;
  rowKey: (record: RecordType) => string;
  /**
   * Grouped alternative to `dataSource`: each section renders its own
   * `<tbody>` under the shared header, optionally wrapped by header/footer
   * rows. Section key order is render order.
   */
  sections?: LiteTableSection<RecordType>[];
}

const LiteTableInner = <RecordType,>({
  className,
  columns,
  dataSource,
  emptyText,
  loading,
  onRowClick,
  rowKey,
  sections,
}: LiteTableProps<RecordType>) => {
  const items = dataSource ?? [];
  const initialLoading =
    !!loading &&
    (sections ? sections.every((section) => section.items.length === 0) : items.length === 0);
  const isEmpty = sections
    ? sections.every((section) => !section.header && !section.footer && section.items.length === 0)
    : items.length === 0;

  const listLabelOf = (column: LiteTableColumn<RecordType>) =>
    column.listSlot || column.listLabel === false
      ? undefined
      : (column.listLabel ?? (typeof column.title === 'string' ? column.title : undefined));

  const renderRecordRow = (record: RecordType, index: number) => (
    <tr
      className={onRowClick ? styles.clickableRow : undefined}
      key={rowKey(record)}
      tabIndex={onRowClick ? 0 : undefined}
      onClick={onRowClick ? () => onRowClick(record) : undefined}
      onKeyDown={
        onRowClick
          ? (event) => {
              // only the row itself — a key pressed inside a cell
              // control (switch, button, input) belongs to it
              if (event.target !== event.currentTarget) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onRowClick(record);
            }
          : undefined
      }
    >
      {columns.map((column) => (
        <td data-label={listLabelOf(column)} data-list-slot={column.listSlot} key={column.key}>
          {column.render(record, index)}
        </td>
      ))}
    </tr>
  );

  const renderSectionRow = (content: ReactNode, key: string) => (
    <tr data-list-section key={key}>
      <td colSpan={columns.length}>{content}</td>
    </tr>
  );

  return (
    <div aria-busy={initialLoading} className={cx(styles.container, className)}>
      {!initialLoading && isEmpty ? (
        emptyText
      ) : (
        // The loading state keeps the table chrome and skeletonises only the
        // cells, so settling is a content swap rather than a relayout (ux §4.1).
        <div className={styles.body}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} style={{ width: column.width }}>
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            {sections ? (
              sections.map((section) => (
                <tbody key={section.key}>
                  {section.header === undefined || section.header === null
                    ? null
                    : renderSectionRow(section.header, `${section.key}:header`)}
                  {initialLoading
                    ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                        <tr key={index}>
                          {columns.map((column) => (
                            <td
                              data-label={listLabelOf(column)}
                              data-list-slot={column.listSlot}
                              key={column.key}
                            >
                              <Skeleton style={{ height: 14, minWidth: 0, width: '100%' }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : section.items.map(renderRecordRow)}
                  {section.footer === undefined || section.footer === null
                    ? null
                    : renderSectionRow(section.footer, `${section.key}:footer`)}
                </tbody>
              ))
            ) : (
              <tbody>
                {initialLoading
                  ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                      <tr key={index}>
                        {columns.map((column) => (
                          <td
                            data-label={listLabelOf(column)}
                            data-list-slot={column.listSlot}
                            key={column.key}
                          >
                            <Skeleton style={{ height: 14, minWidth: 0, width: '100%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : items.map(renderRecordRow)}
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

const LiteTable = memo(LiteTableInner) as typeof LiteTableInner;

export default LiteTable;
