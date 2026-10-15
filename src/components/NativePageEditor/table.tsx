'use client';
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableSelection,
  TableCellHeaderStates,
} from '@orvilo/editor-runtime/native-browser';
import {
  AUTO_FIT_TABLE_COLUMN_WIDTH_COMMAND,
  DISTRIBUTE_TABLE_COLUMN_WIDTH_COMMAND,
  INSERT_TABLE_COLUMN_COMMAND,
  INSERT_TABLE_ROW_COMMAND,
  MOVE_TABLE_COLUMN_COMMAND,
  MOVE_TABLE_ROW_COMMAND,
  type NativeIEditorKernel,
  SELECT_TABLE_COMMAND,
  SYNC_TABLE_COLUMN_WIDTH_COMMAND,
} from '@orvilo/editor-runtime/native-browser';
import { $getNodeByKey, $getSelection, type LexicalEditor, type LexicalNode } from 'lexical';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { useNativeEditable } from './useNativeEditable';

export function NativeTableController({
  node,
  lexical,
  kernel,
  axis,
}: {
  node: LexicalNode;
  lexical: LexicalEditor;
  kernel: NativeIEditorKernel;
  axis: 'row' | 'column';
}) {
  const { t } = useTranslation('editor');
  const editable = useNativeEditable(kernel);
  const tableKey = node.getKey();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([0]);
  const [targetIndex, setTargetIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const dragged = useRef<number[] | null>(null);
  const anchor = useRef(0);
  const resizeStart = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [count, setCount] = useState(1);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const update = () =>
      lexical.getEditorState().read(() => {
        const table = $getNodeByKey(tableKey);
        if (!$isTableNode(table)) return;
        const nextCount = axis === 'row' ? table.getChildrenSize() : table.getColumnCount();
        setCount(nextCount);
        const selection = $getSelection();
        if ($isTableSelection(selection) && selection.tableKey === tableKey) {
          const shape = selection.getShape();
          const from = axis === 'row' ? shape.fromY : shape.fromX;
          const to = axis === 'row' ? shape.toY : shape.toX;
          setSelected(Array.from({ length: to - from + 1 }, (_, i) => from + i));
        }
        setWidth(table.getColWidths()?.[Math.min(index, Math.max(nextCount - 1, 0))] ?? 0);
      });
    update();
    return lexical.registerUpdateListener(update);
  }, [axis, index, lexical, tableKey]);
  const current = Math.min(index, Math.max(count - 1, 0));
  const selectAt = (target: number, extend = false) => {
    if (!extend) anchor.current = target;
    setIndex(target);
    kernel.dispatchCommand(
      SELECT_TABLE_COMMAND,
      axis === 'row'
        ? { table: tableKey, rowIndex: target, extend, anchorIndex: anchor.current }
        : { table: tableKey, columnIndex: target, extend, anchorIndex: anchor.current },
    );
  };
  const select = () => selectAt(current);
  const selectedIndexes = selected.filter((value) => value >= 0 && value < count);
  const move = (indexes: number[], destination: number, insertAfter: boolean) => {
    if (!kernel.isEditable()) return;
    const handled =
      axis === 'row'
        ? kernel.dispatchCommand(MOVE_TABLE_ROW_COMMAND, {
            table: tableKey,
            selectedRows: indexes,
            rowIndex: destination,
            insertAfter,
          })
        : kernel.dispatchCommand(MOVE_TABLE_COLUMN_COMMAND, {
            table: tableKey,
            selectedColumns: indexes,
            columnIndex: destination,
            insertAfter,
          });
    if (!handled)
      setNotice(
        t('table.moveUnavailable', {
          defaultValue: 'This selection cannot move to that position.',
        }),
      );
    else setNotice('');
  };
  const toggleHeader = () =>
    lexical.update(() => {
      if (!lexical.isEditable()) return;
      const selection = $getSelection();
      if (!$isTableSelection(selection) || selection.tableKey !== tableKey) return;
      const cells = selection.getNodes().filter($isTableCellNode);
      const mask = axis === 'row' ? TableCellHeaderStates.ROW : TableCellHeaderStates.COLUMN;
      const enabled = cells.every((cell) => cell.hasHeaderState(mask));
      cells.forEach((cell) =>
        cell.setHeaderStyles(enabled ? TableCellHeaderStates.NO_STATUS : mask, mask),
      );
    });
  const insert = (insertAfter: boolean) => {
    if (!kernel.isEditable()) return;
    const boundary = insertAfter
      ? Math.max(...selectedIndexes, current)
      : Math.min(...selectedIndexes, current);
    if (axis === 'row')
      kernel.dispatchCommand(INSERT_TABLE_ROW_COMMAND, {
        table: tableKey,
        rowIndex: boundary,
        insertAfter,
      });
    else
      kernel.dispatchCommand(INSERT_TABLE_COLUMN_COMMAND, {
        table: tableKey,
        columnIndex: boundary,
        insertAfter,
      });
  };
  const resize = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    lexical.update(() => {
      if (!lexical.isEditable()) return;
      const table = $getNodeByKey(tableKey);
      if (!$isTableNode(table)) return;
      const existing = table.getColWidths();
      // Preserve measured/current sibling widths: no approximate equal-width overwrite.
      if (!existing || existing.length !== table.getColumnCount()) return;
      const next = [...existing];
      next[current] = value;
      table.setColWidths(next);
    });
  };
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      contentEditable={false}
      role="group"
      aria-label={t(axis === 'row' ? 'table.rowActions' : 'table.columnActions', {
        defaultValue: axis === 'row' ? 'Table rows' : 'Table columns',
      })}
    >
      <div
        className="flex flex-wrap gap-1"
        aria-label={t('table.dragSelection', {
          defaultValue: 'Select and drag table rows or columns',
        })}
      >
        {Array.from({ length: count }, (_, i) => (
          <Button
            aria-pressed={selectedIndexes.includes(i)}
            disabled={!editable}
            draggable={editable}
            key={i}
            size="default"
            variant={selectedIndexes.includes(i) ? 'secondary' : 'ghost'}
            onClick={(event) => selectAt(i, event.shiftKey)}
            onMouseDown={(event) => event.preventDefault()}
            onDragEnd={() => {
              dragged.current = null;
            }}
            onDragOver={(event) => {
              if (dragged.current) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDragStart={(event) => {
              event.stopPropagation();
              dragged.current = selectedIndexes.includes(i) ? selectedIndexes : [i];
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', `${axis}:${i}`);
            }}
            onDrop={(event) => {
              if (!dragged.current) return;
              event.preventDefault();
              event.stopPropagation();
              move(dragged.current, i, false);
              dragged.current = null;
            }}
            onKeyDown={(event) => {
              if (
                !(event.ctrlKey || event.metaKey) ||
                !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
              )
                return;
              event.preventDefault();
              const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
              const edge = forward
                ? Math.max(...selectedIndexes) + 1
                : Math.min(...selectedIndexes) - 1;
              if (edge >= 0 && edge < count) move(selectedIndexes, edge, forward);
            }}
          >
            {i + 1}
          </Button>
        ))}
      </div>
      <select
        aria-label={t('table.select', { defaultValue: 'Select row or column' })}
        className="h-9 rounded-(--radius-input) border border-input bg-background px-2 text-sm"
        disabled={!editable}
        value={current}
        onChange={(event) => selectAt(Number(event.target.value))}
      >
        {Array.from({ length: count }, (_, i) => (
          <option key={i} value={i}>
            {i + 1}
          </option>
        ))}
      </select>
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onClick={select}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t('table.select')}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onClick={() => insert(false)}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t(axis === 'row' ? 'table.insertRowAbove' : 'table.insertColumnBefore', {
          defaultValue: 'Insert before',
        })}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onClick={() => insert(true)}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t(axis === 'row' ? 'table.insertRowBelow' : 'table.insertColumnAfter', {
          defaultValue: 'Insert after',
        })}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          lexical.update(() => {
            if (!lexical.isEditable()) return;
            if (axis === 'row') $deleteTableRowAtSelection();
            else $deleteTableColumnAtSelection();
          });
        }}
      >
        {t(axis === 'row' ? 'table.deleteRow' : 'table.deleteColumn')}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onClick={toggleHeader}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t('table.toggleHeader', { defaultValue: 'Toggle header' })}
      </Button>
      <select
        aria-label={t('table.moveTarget', { defaultValue: 'Move target' })}
        className="h-9 rounded-(--radius-input) border border-input bg-background px-2 text-sm"
        disabled={!editable}
        value={Math.min(targetIndex, Math.max(count - 1, 0))}
        onChange={(event) => setTargetIndex(Number(event.target.value))}
      >
        {Array.from({ length: count }, (_, i) => (
          <option key={i} value={i}>
            {i + 1}
          </option>
        ))}
      </select>
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onClick={() => move(selectedIndexes, targetIndex, false)}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t('table.moveBefore', { defaultValue: 'Move before' })}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onClick={() => move(selectedIndexes, targetIndex, true)}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t('table.moveAfter', { defaultValue: 'Move after' })}
      </Button>
      {axis === 'column' ? (
        <>
          <Button
            disabled={!editable}
            size="default"
            variant="outline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              kernel.isEditable() &&
              kernel.dispatchCommand(AUTO_FIT_TABLE_COLUMN_WIDTH_COMMAND, {
                table: tableKey,
                columnIndexes: selectedIndexes,
              })
            }
          >
            {t('table.autoFit', { defaultValue: 'Auto fit width' })}
          </Button>
          <Button
            disabled={!editable}
            size="default"
            variant="outline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              kernel.isEditable() &&
              kernel.dispatchCommand(SYNC_TABLE_COLUMN_WIDTH_COMMAND, {
                table: tableKey,
                columnIndex: current,
              })
            }
          >
            {t('table.syncWidth', { defaultValue: 'Sync width' })}
          </Button>
          <Button
            disabled={!editable}
            size="default"
            variant="outline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              kernel.isEditable() &&
              kernel.dispatchCommand(DISTRIBUTE_TABLE_COLUMN_WIDTH_COMMAND, { table: tableKey })
            }
          >
            {t('table.distributeWidth', { defaultValue: 'Distribute width' })}
          </Button>
        </>
      ) : null}
      {notice ? <span role="status">{notice}</span> : null}
      {axis === 'column' && width > 0 ? (
        <Button
          aria-label={t('table.resizeColumn', { defaultValue: 'Drag to resize column' })}
          className="touch-none"
          disabled={!editable}
          size="default"
          variant="outline"
          onPointerCancel={() => {
            resizeStart.current = null;
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeStart.current = { pointerId: event.pointerId, x: event.clientX, width };
          }}
          onPointerMove={(event) => {
            const start = resizeStart.current;
            if (start?.pointerId !== event.pointerId) return;
            const direction = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1;
            resize(Math.max(1, start.width + direction * (event.clientX - start.x)));
          }}
          onPointerUp={(event) => {
            if (resizeStart.current?.pointerId === event.pointerId) {
              resizeStart.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
        >
          {t('table.resize', { defaultValue: 'Resize' })}
        </Button>
      ) : null}
      {axis === 'column' && width > 0 ? (
        <input
          aria-label={t('table.columnWidth', { defaultValue: 'Column width' })}
          className="h-9 w-24 rounded-(--radius-input) border border-input bg-background px-2 text-sm"
          disabled={!editable}
          min={1}
          type="number"
          value={width}
          onChange={(event) => resize(event.target.valueAsNumber)}
        />
      ) : null}
    </div>
  );
}
