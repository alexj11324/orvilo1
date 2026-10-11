'use client';

import { Handle, Position } from '@xyflow/react';
import { cn } from 'cn';
import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CirclePause,
  CircleX,
  Paperclip,
  Repeat2,
} from 'lucide-react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';

export interface FlowNodeData extends Record<string, unknown> {
  attempts: number;
  evidence: number;
  expected: string;
  selected: boolean;
  state?: 'passed' | 'failed' | 'uncertain' | 'blocked' | 'partial';
  title: string;
}

export const flowStateBackground = (state?: string) =>
  state === 'passed'
    ? 'var(--success-wash)'
    : state === 'failed'
      ? 'var(--destructive-wash)'
      : state
        ? 'var(--warning-wash)'
        : 'var(--accent)';

export const flowStateColor = (state?: string) =>
  state === 'passed'
    ? 'var(--success-text)'
    : state === 'failed'
      ? 'var(--destructive-text)'
      : state
        ? 'var(--warning-text)'
        : 'var(--foreground-tertiary)';

// The public style prop keeps these hit targets independent of React Flow stylesheet order.
export const flowHandleStyle = {
  width: 1,
  minWidth: 0,
  height: 1,
  minHeight: 0,
  border: 0,
  opacity: 0,
};

const styles = {
  card: 'overflow-hidden flex flex-col w-65 h-full border border-sidebar-border rounded-(--radius-card) bg-card transition-[border-color,box-shadow] duration-(--orvilo-motion-mid) ease-[ease] motion-reduce:transition-none hover:border-primary-border',
  selected: 'border-primary-border ring-2 ring-primary-wash',
  // Four standard text lines and the metadata footer stay inside the graph's 132px box.
  head: 'p-2',
  glyph:
    'flex flex-none items-center justify-center size-9 rounded-(--radius-card) text-muted-foreground bg-accent',
  title: 'line-clamp-2 text-sm font-semibold',
  subtitle: 'line-clamp-2 text-xs text-foreground-tertiary',
  footer:
    'mt-auto py-0.5 px-2 border-bs border-dashed border-sidebar-border text-xs text-foreground-tertiary',
};

/** Same status/head/summary hierarchy as Goal's exploration cards. */
export function FlowNode({ data }: { data: FlowNodeData }) {
  const { t } = useTranslation('verify');
  const statusIcon =
    data.state === 'passed'
      ? CheckCircle2
      : data.state === 'failed'
        ? CircleX
        : data.state === 'blocked'
          ? CirclePause
          : data.state === 'partial'
            ? CircleDot
            : data.state === 'uncertain'
              ? CircleHelp
              : CircleDashed;
  return (
    <>
      <Handle id="in" position={Position.Left} style={flowHandleStyle} type="target" />
      <div className={cn(styles.card, data.selected && styles.selected)}>
        <div className={`flex gap-2.5 ${styles.head}`}>
          <div
            aria-label={t(`flow.state.${data.state ?? 'pending'}`)}
            className={styles.glyph}
            role="img"
            style={{
              background: flowStateBackground(data.state),
              color: flowStateColor(data.state),
            }}
          >
            {createElement(statusIcon, { size: 16 })}
          </div>
          <div className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
            <span className={styles.title}>{data.title}</span>
            <span className={styles.subtitle}>{data.expected}</span>
          </div>
        </div>
        <div className={`flex items-center gap-3 ${styles.footer}`}>
          <div className="flex items-center gap-1">
            <Repeat2 className="size-4" size={16} />
            {data.attempts}
          </div>
          <div className="flex items-center gap-1">
            <Paperclip className="size-4" size={16} />
            {data.evidence}
          </div>
        </div>
      </div>
      <Handle id="out" position={Position.Right} style={flowHandleStyle} type="source" />
      <Handle
        id="return-in"
        position={Position.Bottom}
        style={{ ...flowHandleStyle, left: '35%' }}
        type="target"
      />
      <Handle
        id="return-out"
        position={Position.Bottom}
        style={{ ...flowHandleStyle, left: '65%' }}
        type="source"
      />
    </>
  );
}
