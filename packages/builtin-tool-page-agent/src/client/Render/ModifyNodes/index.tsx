'use client';

import type { ModifyNodesArgs, ModifyOperation } from '@orvilo/editor-runtime';
import type { BuiltinRenderProps } from '@orvilo/types';
import { Check, DiffIcon, Minus, Plus, X } from 'lucide-react';
import { createElement, memo } from 'react';

import type { ModifyNodesState } from '../../../types';

const styles = {
  content: 'min-w-0 flex-1 truncate font-mono text-[12px] text-foreground',
  index: 'w-[18px] shrink-0 text-end text-[12px] text-[var(--ant-color-text-quaternary)]',
  position:
    'shrink-0 rounded-[4px] bg-accent px-1.5 py-px font-mono text-[11px] text-muted-foreground',
  row: 'flex items-center gap-2 px-3 py-2 not-last:[border-block-end:1px_dashed_var(--sidebar-border)]',
};

const actionMeta = {
  insert: { color: 'var(--success)', icon: Plus },
  modify: { color: 'var(--warning)', icon: DiffIcon },
  remove: { color: 'var(--destructive)', icon: Minus },
} as const;

const getOperationDetails = (op: ModifyOperation) => {
  switch (op.action) {
    case 'insert': {
      const position = 'afterId' in op ? `after #${op.afterId}` : `before #${op.beforeId}`;
      return { content: op.litexml, position };
    }
    case 'modify': {
      const litexml = Array.isArray(op.litexml) ? op.litexml.join('\n') : op.litexml;
      return { content: litexml };
    }
    case 'remove': {
      return { position: `#${op.id}` };
    }
  }
};

export const ModifyNodesRender = memo<BuiltinRenderProps<ModifyNodesArgs, ModifyNodesState>>(
  ({ args, pluginState }) => {
    const operations = args?.operations;
    if (!Array.isArray(operations) || operations.length === 0) return null;

    const results = pluginState?.results ?? [];

    return (
      <div className="w-full rounded-[var(--ant-border-radius)] border border-sidebar-border bg-card">
        {operations.map((op, index) => {
          const meta = actionMeta[op.action];
          const details = getOperationDetails(op);
          const result = results[index];
          const success = result?.success === true;
          const failed = result?.success === false;

          return (
            <div className={styles.row} key={index}>
              <span className={styles.index}>{index + 1}.</span>
              {createElement(meta.icon, {
                size: 14,
                style: { color: meta.color, flexShrink: 0 },
              })}
              {details.position && <span className={styles.position}>{details.position}</span>}
              {details.content && <span className={styles.content}>{details.content}</span>}
              {success && <Check size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />}
              {failed && (
                <>
                  <X size={14} style={{ color: 'var(--destructive)', flexShrink: 0 }} />
                  {result?.error && (
                    <span className="text-[11px] text-destructive">{result.error}</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);

ModifyNodesRender.displayName = 'ModifyNodesRender';

export default ModifyNodesRender;
