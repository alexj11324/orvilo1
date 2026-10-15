'use client';

import { cn } from 'cn';
import { PlusIcon } from 'lucide-react';
import { type CSSProperties, Fragment, type MouseEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  gutterRange,
  isLineSelected,
  nextSelection,
  parsePatchHunks,
  type PatchDiffLine,
  type PatchDiffLineRange,
  type PatchDiffSelection,
  type PatchDiffSide,
  toSplitRows,
} from './parse';

export type { PatchDiffLineRange, PatchDiffSide } from './parse';

export interface PatchDiffOptions {
  /** Show a per-line action button in the gutter. */
  enableGutterUtility?: boolean;
  /** Click a line number to select it; shift-click extends the selection. */
  enableLineSelection?: boolean;
  /** `none` disables word-level emphasis inside changed lines. */
  lineDiffType?: 'char' | 'none' | 'word' | 'word-alt';
  /** `disabled` turns off the row hover wash. */
  lineHoverHighlight?: 'both' | 'disabled' | 'line' | 'number';
  /** Receives the selected range when it contains the line, otherwise that line. */
  onGutterUtilityClick?: (range: PatchDiffLineRange) => void;
  overflow?: 'scroll' | 'wrap';
}

export interface PatchDiffProps {
  className?: string;
  diffOptions?: PatchDiffOptions;
  fileName?: string;
  /** Accepted for API compatibility; patches are read by tint, not grammar. */
  language?: string;
  patch: string;
  showHeader?: boolean;
  style?: CSSProperties;
  variant?: 'borderless' | 'filled' | 'outlined';
  viewMode?: 'split' | 'unified';
}

const ROW_TINT: Record<PatchDiffLine['kind'], string> = {
  addition: 'bg-success-wash',
  context: '',
  deletion: 'bg-destructive-wash',
};
const SEGMENT_TINT: Record<PatchDiffLine['kind'], string> = {
  addition: 'bg-success-subtle',
  context: '',
  deletion: 'bg-destructive-subtle',
};
const MARKER: Record<PatchDiffLine['kind'], string> = {
  addition: '+',
  context: ' ',
  deletion: '-',
};

const LineText = ({ line, wrap }: { line?: PatchDiffLine; wrap: boolean }) => {
  if (!line) return null;
  return (
    <span className={cn(wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}>
      {line.segments
        ? line.segments.map((segment, index) =>
            segment.changed ? (
              <mark
                className={cn('rounded-(--radius-chip) text-inherit', SEGMENT_TINT[line.kind])}
                key={index}
              >
                {segment.text}
              </mark>
            ) : (
              <Fragment key={index}>{segment.text}</Fragment>
            ),
          )
        : line.text || ' '}
    </span>
  );
};

/** Unified or split view of a unified patch, parsed with the `diff` package. */
export const PatchDiff = ({
  className,
  diffOptions,
  fileName,
  patch,
  showHeader = true,
  style,
  variant = 'filled',
  viewMode = 'unified',
}: PatchDiffProps) => {
  const { t } = useTranslation('components');
  const {
    enableGutterUtility,
    enableLineSelection,
    lineDiffType = 'word-alt',
    lineHoverHighlight = 'both',
    onGutterUtilityClick,
    overflow = 'scroll',
  } = diffOptions ?? {};
  const wrap = overflow === 'wrap';
  const hoverable = lineHoverHighlight !== 'disabled';
  const columns =
    (viewMode === 'split' ? 4 : 3) + (enableGutterUtility ? (viewMode === 'split' ? 2 : 1) : 0);
  const hunks = useMemo(
    () => parsePatchHunks(patch, lineDiffType !== 'none'),
    [patch, lineDiffType],
  );
  const [selection, setSelection] = useState<PatchDiffSelection | null>(null);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const hunk of hunks)
      for (const line of hunk.lines) {
        if (line.kind === 'addition') added += 1;
        if (line.kind === 'deletion') removed += 1;
      }
    return { added, removed };
  }, [hunks]);

  const isSelected = (line: PatchDiffLine | undefined, side?: PatchDiffSide) =>
    isLineSelected(selection, line, side);

  const selectLine = (event: MouseEvent, line: PatchDiffLine, side?: PatchDiffSide) => {
    if (!enableLineSelection) return;
    setSelection((current) => nextSelection(current, line, side, event.shiftKey));
  };

  const runGutterUtility = (line: PatchDiffLine, side?: PatchDiffSide) =>
    onGutterUtilityClick?.(gutterRange(selection, line, side));

  const numberCell = (
    line: PatchDiffLine | undefined,
    number: number | undefined,
    side?: PatchDiffSide,
  ) => (
    <td
      className={cn(
        'w-px px-2 text-end align-top text-muted-foreground tabular-nums select-none',
        line && ROW_TINT[line.kind],
        enableLineSelection && line && 'cursor-pointer hover:text-foreground',
      )}
      onClick={line ? (event) => selectLine(event, line, side) : undefined}
    >
      {number}
    </td>
  );

  const utilityCell = (line: PatchDiffLine | undefined, side?: PatchDiffSide) =>
    enableGutterUtility ? (
      <td className="w-6 p-0 align-top">
        {line ? (
          <button
            aria-label={t('PatchDiff.lineAction')}
            className="flex size-5.5 items-center justify-center rounded-(--radius-input) bg-primary text-primary-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            type="button"
            onClick={() => runGutterUtility(line, side)}
          >
            <PlusIcon className="size-3.5" />
          </button>
        ) : null}
      </td>
    ) : null;

  const codeCell = (line: PatchDiffLine | undefined, side?: PatchDiffSide) => (
    <td
      className={cn(
        'px-2 align-top',
        line && ROW_TINT[line.kind],
        line?.kind === 'context' && hoverable && 'group-hover/row:bg-accent',
        isSelected(line, side) && 'bg-selected',
        !line && 'bg-fill-quaternary',
      )}
    >
      {line ? (
        <>
          <span className="pe-2 text-muted-foreground select-none">{MARKER[line.kind]}</span>
          <LineText line={line} wrap={wrap} />
        </>
      ) : null}
    </td>
  );

  return (
    <div
      data-slot="patch-diff"
      style={style}
      className={cn(
        'min-w-0 font-mono text-sm leading-5.5',
        variant !== 'borderless' && 'overflow-hidden rounded-(--radius-card)',
        variant === 'filled' && 'bg-card',
        variant === 'outlined' && 'border border-divider',
        className,
      )}
    >
      {showHeader ? (
        <div className="flex items-center gap-2 border-b border-divider px-3 py-1.5 font-sans text-xs">
          <span className="min-w-0 flex-1 truncate text-foreground">{fileName}</span>
          {stats.removed > 0 && <span className="text-destructive-text">-{stats.removed}</span>}
          {stats.added > 0 && <span className="text-success-text">+{stats.added}</span>}
        </div>
      ) : null}
      <div className={cn(!wrap && 'overflow-x-auto')}>
        <table className={cn('border-collapse', wrap ? 'w-full table-fixed' : 'min-w-full')}>
          {hunks.map((hunk, hunkIndex) => (
            <tbody key={hunkIndex}>
              <tr className="bg-fill-quaternary text-muted-foreground">
                <td className="px-2 py-0.5" colSpan={columns}>
                  {hunk.header}
                </td>
              </tr>
              {viewMode === 'split'
                ? toSplitRows(hunk.lines).map((row, rowIndex) => (
                    <tr className="group/row" key={rowIndex}>
                      {numberCell(row.left, row.left?.oldNumber, 'deletions')}
                      {utilityCell(row.left, 'deletions')}
                      {codeCell(row.left, 'deletions')}
                      {numberCell(row.right, row.right?.newNumber, 'additions')}
                      {utilityCell(row.right, 'additions')}
                      {codeCell(row.right, 'additions')}
                    </tr>
                  ))
                : hunk.lines.map((line, lineIndex) => (
                    <tr className="group/row" data-kind={line.kind} key={lineIndex}>
                      {numberCell(line, line.oldNumber)}
                      {numberCell(line, line.newNumber)}
                      {utilityCell(line)}
                      {codeCell(line)}
                    </tr>
                  ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
};

export default PatchDiff;
