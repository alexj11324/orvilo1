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
    ? 'var(--ant-color-success-bg)'
    : state === 'failed'
      ? 'var(--ant-color-error-bg)'
      : state
        ? 'var(--ant-color-warning-bg)'
        : 'var(--accent)';

export const flowStateColor = (state?: string) =>
  state === 'passed'
    ? 'var(--success)'
    : state === 'failed'
      ? 'var(--destructive)'
      : state
        ? 'var(--warning)'
        : 'var(--ant-color-text-tertiary)';

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
  card: 'overflow-hidden flex flex-col w-[260px] h-full border border-sidebar-border rounded-(--ant-border-radius-lg) bg-card transition-[border-color,box-shadow] duration-150 ease-[ease] hover:border-(--ant-color-primary-border)',
  selected: 'border-(--ant-color-primary-border) shadow-[0_0_0_2px_var(--ant-color-primary-bg)]',
  head: 'p-3',
  glyph:
    'flex flex-none items-center justify-center size-9 rounded-(--ant-border-radius) text-muted-foreground bg-accent',
  title: 'line-clamp-2 text-[13px] font-medium leading-[1.4]',
  subtitle: 'line-clamp-2 text-[11px] leading-4 text-(--ant-color-text-tertiary)',
  footer:
    'mt-auto py-[7px] px-3 border-t border-dashed border-sidebar-border text-[11px] text-(--ant-color-text-tertiary)',
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
            {createElement(statusIcon, { size: 24 })}
          </div>
          <div className="flex flex-col gap-[3px]" style={{ minWidth: 0 }}>
            <span className={styles.title}>{data.title}</span>
            <span className={styles.subtitle}>{data.expected}</span>
          </div>
        </div>
        <div className={`flex items-center gap-3 ${styles.footer}`}>
          <div className="flex items-center gap-1">
            <Repeat2 size={12} />
            {data.attempts}
          </div>
          <div className="flex items-center gap-1">
            <Paperclip size={12} />
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
