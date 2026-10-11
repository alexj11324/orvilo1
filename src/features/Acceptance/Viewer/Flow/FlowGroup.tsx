import { Handle, Position, useNodeId } from '@xyflow/react';
import { cn } from 'cn';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CirclePause,
  CircleX,
  Maximize2,
} from 'lucide-react';
import { createElement, use } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { FlowAnchorContext } from './flowAnchor';
import type { FlowGraphData } from './flowGraph';
import { flowHandleStyle, flowStateBackground, flowStateColor } from './FlowNode';

const styles = {
  group:
    'overflow-hidden w-full h-full border border-sidebar-border rounded-(--radius-card) bg-card',
  header: 'h-9 px-4 bg-transparent',
  collapsed: 'cursor-pointer h-full p-3',
  glyph: 'flex flex-none items-center justify-center size-9 rounded-(--radius-card)',
  title: 'line-clamp-2 text-sm font-semibold',
  summary: 'text-xs text-foreground-tertiary',
};

export function FlowGroup({ data }: { data: FlowGraphData }) {
  const { t } = useTranslation('verify');
  const anchor = use(FlowAnchorContext);
  const nodeId = useNodeId();
  // Name this group as the one to follow once the new layout lands.
  const toggle = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    anchor.current = nodeId;
    data.onToggle?.();
  };
  const statusIcon =
    data.state === 'passed'
      ? CheckCircle2
      : data.state === 'failed'
        ? CircleX
        : data.state === 'blocked'
          ? CirclePause
          : data.state === 'uncertain'
            ? CircleHelp
            : data.state === 'partial'
              ? CircleDot
              : CircleDashed;
  return (
    <>
      <Handle id="in" position={Position.Left} style={flowHandleStyle} type="target" />
      <div className={styles.group}>
        {data.collapsed ? (
          <div
            className={`flex flex-col gap-0.5 ${styles.collapsed}`}
            role="button"
            onClick={toggle}
          >
            <div className="flex items-start gap-2.5">
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
              <div className="flex-1" style={{ minWidth: 0 }}>
                <span className={styles.title}>{data.title}</span>
              </div>
              <div className="flex items-center gap-0.5" style={{ flex: 'none' }}>
                {data.onToggle && (
                  <Button
                    aria-label={t('flow.expandGroup', { title: data.title })}
                    className={cn('nodrag nopan')}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={toggle}
                  >
                    <ChevronRight size={16} />
                  </Button>
                )}
                {data.onEnter && (
                  <Button
                    aria-label={t('flow.enterGroup', { title: data.title })}
                    className={cn('nodrag nopan')}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEnter?.();
                    }}
                  >
                    <Maximize2 size={16} />
                  </Button>
                )}
              </div>
            </div>
            <span className={styles.summary}>
              {`${data.passed}/${data.total} · ${t(`flow.state.${data.state ?? 'pending'}`)}`}
              {Boolean(data.reviewed) && ` · ${t('flow.groupReviewed', { count: data.reviewed })}`}
            </span>
          </div>
        ) : (
          <div className={`flex items-center gap-2 ${styles.header}`}>
            {data.onToggle && (
              <Button
                aria-label={t('flow.collapseGroup', { title: data.title })}
                className={cn('nodrag nopan')}
                size="icon"
                type="button"
                variant="ghost"
                onClick={toggle}
              >
                <ChevronDown size={16} />
              </Button>
            )}
            {createElement(statusIcon, { size: 16, style: { color: flowStateColor(data.state) } })}
            <div className="truncate min-w-0 text-sm font-semibold" style={{ flex: 1 }}>
              {data.title}
            </div>
            <div className="text-xs text-muted-foreground">{`${data.passed}/${data.total}`}</div>
            {Boolean(data.reviewed) && (
              <div className="text-xs text-muted-foreground">
                {t('flow.groupReviewed', { count: data.reviewed })}
              </div>
            )}
            {data.onEnter && (
              <Button
                aria-label={t('flow.enterGroup', { title: data.title })}
                className={cn('nodrag nopan')}
                size="icon"
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEnter?.();
                }}
              >
                <Maximize2 size={16} />
              </Button>
            )}
          </div>
        )}
      </div>
      <Handle id="stack-in" position={Position.Top} style={flowHandleStyle} type="target" />
      <Handle id="stack-out" position={Position.Bottom} style={flowHandleStyle} type="source" />
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
