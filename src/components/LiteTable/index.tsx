import { clsx as cx } from 'cn';
import { type ReactNode } from 'react';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/** Placeholder rows shown before the first load settles. */
const SKELETON_ROWS = 4;

const styles = {
  body: 'overflow-x-auto',
  clickableRow:
    'cursor-pointer focus-visible:outline-2 focus-visible:outline-primary-text focus-visible:-outline-offset-2',
  container: '@container',
  table:
    "w-full min-w-max border-collapse text-sm leading-5.5 [&_:is(th,td)]:px-2 [&_:is(th,td)]:py-2 [&_:is(th,td)]:text-start [&_:is(th,td)]:align-middle [&_thead_th]:font-medium [&_thead_th]:text-muted-foreground [&_thead_th]:whitespace-nowrap [&_thead_th]:bg-fill-quaternary [@container(width>600px)]:[&_tr>:is(th,td):first-child]:ps-6 [@container(width>600px)]:[&_tr>:is(th,td):last-child]:pe-6 [&_tbody_tr:hover]:bg-fill-quaternary [&_tbody_tr[data-list-section]:hover]:bg-transparent [@container(width<=600px)]:block [@container(width<=600px)]:min-w-0 [@container(width<=600px)]:[&_thead]:hidden [@container(width<=600px)]:[&_tbody]:flex [@container(width<=600px)]:[&_tbody]:flex-col [@container(width<=600px)]:[&_tbody]:gap-3 [@container(width<=600px)]:[&_tbody]:px-4 [@container(width<=600px)]:[&_tbody_tr]:grid [@container(width<=600px)]:[&_tbody_tr]:grid-cols-[1fr_auto] [@container(width<=600px)]:[&_tbody_tr]:items-center [@container(width<=600px)]:[&_tbody_tr]:pt-1 [@container(width<=600px)]:[&_tbody_tr]:pb-2 [@container(width<=600px)]:[&_tbody_tr]:px-4 [@container(width<=600px)]:[&_tbody_tr]:border [@container(width<=600px)]:[&_tbody_tr]:border-divider [@container(width<=600px)]:[&_tbody_tr]:rounded-(--radius-card) [@container(width<=600px)]:[&_tbody_tr:hover]:bg-transparent [@container(width<=600px)]:[&_td]:flex [@container(width<=600px)]:[&_td]:col-span-full [@container(width<=600px)]:[&_td]:items-center [@container(width<=600px)]:[&_td]:justify-between [@container(width<=600px)]:[&_td]:gap-4 [@container(width<=600px)]:[&_td]:px-0 [@container(width<=600px)]:[&_td]:py-1.5 [@container(width<=600px)]:[&_td[data-label]::before]:content-[attr(data-label)] [@container(width<=600px)]:[&_td[data-label]::before]:shrink-0 [@container(width<=600px)]:[&_td[data-label]::before]:text-muted-foreground [@container(width<=600px)]:[&_td:not([data-label],[data-list-slot])]:justify-end [@container(width<=600px)]:[&_td[data-list-slot='title']]:col-start-1 [@container(width<=600px)]:[&_td[data-list-slot='title']]:col-end-2 [@container(width<=600px)]:[&_td[data-list-slot='title']]:row-start-1 [@container(width<=600px)]:[&_td[data-list-slot='title']]:justify-start [@container(width<=600px)]:[&_td[data-list-slot='title']]:py-2 [@container(width<=600px)]:[&_td[data-list-slot='title']]:border-b [@container(width<=600px)]:[&_td[data-list-slot='title']]:border-divider [@container(width<=600px)]:[&_td[data-list-slot='title']]:font-semibold [@container(width<=600px)]:[&_td[data-list-slot='extra']]:col-start-2 [@container(width<=600px)]:[&_td[data-list-slot='extra']]:col-end-3 [@container(width<=600px)]:[&_td[data-list-slot='extra']]:row-start-1 [@container(width<=600px)]:[&_td[data-list-slot='extra']]:justify-end [@container(width<=600px)]:[&_td[data-list-slot='extra']]:py-2 [@container(width<=600px)]:[&_td[data-list-slot='extra']]:border-b [@container(width<=600px)]:[&_td[data-list-slot='extra']]:border-divider [@container(width<=600px)]:[&_td[data-list-slot='actions']]:justify-end [@container(width<=600px)]:[&_tbody_tr[data-list-section]]:block [@container(width<=600px)]:[&_tbody_tr[data-list-section]]:p-0 [@container(width<=600px)]:[&_tbody_tr[data-list-section]]:border-0 [@container(width<=600px)]:[&_tbody_tr[data-list-section]]:rounded-none [@container(width<=600px)]:[&_tbody_tr[data-list-section]:hover]:bg-transparent [@container(width<=600px)]:[&_tbody_tr[data-list-section]>td]:block [@container(width<=600px)]:[&_tbody_tr[data-list-section]>td]:py-0 [@container(width<=600px)]:[&_tbody_tr[data-list-section]>td]:px-4 [@container(width<=600px)]:[&_tbody_tr[data-list-section]>td]:border-b-0",
};

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
