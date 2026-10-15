'use client';

import type { NativeIPlugin } from '@orvilo/editor-runtime/native-browser';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { type ReactNode, useMemo } from 'react';

import type { NativeEditorWidgets } from '@/components/NativePageEditor';
import { cn } from '@/lib/utils';

import { ReadOnlyNativeDiffBlock } from './ReadOnlyBlock';
import { computeLexicalDiffRows } from './vendor/compute.js';

export interface NativeHistoryDiffProps {
  labels: { new?: ReactNode; old?: ReactNode };
  newValue: SerializedEditorState;
  oldValue: SerializedEditorState;
  plugins?: NativeIPlugin[];
  widgets: NativeEditorWidgets;
}
function wrap(block: SerializedLexicalNode): SerializedEditorState {
  return {
    root: { children: [block], direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 },
  };
}
/** Opt-in rich diff. The original algorithm preserves serialized structures;
 * actual local registered codecs/widgets render each side, never plain text. */
export function NativeHistoryDiff({
  oldValue,
  newValue,
  labels,
  widgets,
  plugins,
}: NativeHistoryDiffProps) {
  const rows = useMemo(() => computeLexicalDiffRows(oldValue, newValue), [oldValue, newValue]);
  return (
    <div className="min-w-0 bg-card text-foreground">
      <div className="grid grid-cols-2 border-b border-divider bg-muted text-sm font-medium">
        <div className="min-w-0 border-r border-divider p-2">{labels.old}</div>
        <div className="min-w-0 p-2">{labels.new}</div>
      </div>
      {rows.map((row, index) => (
        <div
          className="grid grid-cols-2 border-b border-divider"
          data-diff-kind={row.kind}
          key={index}
        >
          {(['old', 'new'] as const).map((side) => {
            const cell = side === 'old' ? row.oldCell : row.newCell;
            const block = cell?.block;
            return (
              <div
                key={side}
                className={cn(
                  'min-w-0 overflow-x-auto p-2',
                  side === 'old' && 'border-r border-divider',
                  !block && 'bg-muted',
                  row.kind === 'delete' && side === 'old' && 'bg-destructive-wash',
                  row.kind === 'insert' && side === 'new' && 'bg-success-wash',
                )}
              >
                {block && (
                  <ReadOnlyNativeDiffBlock
                    content={wrap(block)}
                    key={JSON.stringify(block)}
                    label={side}
                    plugins={plugins}
                    widgets={widgets}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
