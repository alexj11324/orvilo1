'use client';

import { cn } from 'cn';
import { Maximize2, Minimize2, XIcon } from 'lucide-react';
import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';

import { BAR_HEIGHT } from './const';
import PanelErrorBoundary from './PanelErrorBoundary';
import { type DevDockPanelItem, getItemComponent, useDevDockItems } from './registry';
import { MIN_PANEL_HEIGHT, useDevDockStore } from './store';

const styles = {
  content: 'overflow-hidden flex-1 min-w-0 min-h-0',
  header:
    'shrink-0 h-8 px-2.5 border-b border-divider text-sm leading-5.5 font-medium text-muted-foreground',
  host: 'relative flex flex-col shrink-0 w-full mb-2 border-t border-divider bg-card',
  resizeHandle:
    'touch-none cursor-row-resize absolute z-1 -top-0.75 inset-x-0 h-1.5 hover:bg-accent',
};

const PanelHost = memo(() => {
  const expanded = useDevDockStore((s) => s.expanded);
  const activePanelId = useDevDockStore((s) => s.activePanelId);
  const maximized = useDevDockStore((s) => s.maximized);
  const panelHeight = useDevDockStore((s) => s.panelHeight);
  const setMaximized = useDevDockStore((s) => s.setMaximized);
  const setPanelHeight = useDevDockStore((s) => s.setPanelHeight);
  const togglePanel = useDevDockStore((s) => s.togglePanel);
  const items = useDevDockItems();

  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragging = dragHeight !== null;
  const dragOriginRef = useRef<{ height: number; pointerY: number } | null>(null);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (maximized) return;
      e.preventDefault();
      dragOriginRef.current = { height: panelHeight, pointerY: e.clientY };
      setDragHeight(panelHeight);
    },
    [maximized, panelHeight],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const next = origin.height + (origin.pointerY - e.clientY);
      const max = window.innerHeight - BAR_HEIGHT - 60;
      setDragHeight(Math.min(Math.max(MIN_PANEL_HEIGHT, next), max));
    };
    const onUp = () => {
      setDragHeight((committed) => {
        if (committed !== null) setPanelHeight(committed);
        return null;
      });
      dragOriginRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, setPanelHeight]);

  const item = items.find(
    (candidate): candidate is DevDockPanelItem =>
      candidate.type === 'panel' && candidate.id === activePanelId,
  );

  if (!expanded || !item) return null;

  const Content = getItemComponent(item);
  const Icon = item.icon;
  const height = maximized ? `calc(100dvh - ${BAR_HEIGHT}px)` : `${dragHeight ?? panelHeight}px`;

  return (
    <section className={styles.host} style={{ height }}>
      {!maximized && <div className={styles.resizeHandle} onPointerDown={handleDragStart} />}
      <div className={cn(styles.header, 'flex items-center gap-1.5')}>
        <Icon size={12} />
        <span>{item.label}</span>
        <span className="flex-1" />
        <ActionIcon
          icon={maximized ? Minimize2 : Maximize2}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 14 }}
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => setMaximized(!maximized)}
        />
        <ActionIcon
          icon={XIcon}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 14 }}
          title={'Close panel'}
          onClick={() => togglePanel(item.id)}
        />
      </div>
      <div className={styles.content}>
        <PanelErrorBoundary key={item.id}>
          <Suspense fallback={null}>
            <Content />
          </Suspense>
        </PanelErrorBoundary>
      </div>
    </section>
  );
});

PanelHost.displayName = 'DevDockPanelHost';

export default PanelHost;
