'use client';

import { XIcon } from 'lucide-react';
import { Fragment, type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';

import { DIVIDER_WIDTH, paneTrackWidth, resizePanes } from './paneLayout';
import type { TerminalPane } from './store';
import TerminalView from './TerminalView';

const styles = {
  close: 'absolute z-1 [inset-block-start:2px] end-0.5 opacity-0 [transition:opacity_0.15s]',
  divider:
    "cursor-col-resize relative flex-none after:content-[''] after:absolute after:[inset-block:0] after:[inset-inline-start:calc(50%_-_0.5px)] after:[inline-size:1px] after:bg-sidebar-border after:bg-none after:[transition:background_0.15s] hover:after:bg-primary",
  pane: 'relative overflow-hidden [min-inline-size:0] [transition:opacity_0.15s] data-[inactive-pane]:opacity-70 hover:[&_[data-pane-close]]:opacity-100 focus-within:[&_[data-pane-close]]:opacity-100',
  root: 'flex [block-size:100%]',
};

interface SplitViewProps {
  activePaneId: string;
  onActivatePane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onResize: (flex: number[]) => void;
  panes: TerminalPane[];
}

const SplitView = ({
  activePaneId,
  onActivatePane,
  onClosePane,
  onResize,
  panes,
}: SplitViewProps) => {
  const { t } = useTranslation('chat');
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragFlex, setDragFlex] = useState<number[]>();

  const flex = dragFlex?.length === panes.length ? dragFlex : panes.map((pane) => pane.flex);
  const split = panes.length > 1;

  const handleDividerDown =
    (dividerIndex: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      const root = rootRef.current;
      if (!root) return;
      event.preventDefault();

      const startX = event.clientX;
      const start = [...flex];
      const trackWidth = paneTrackWidth(root.getBoundingClientRect().width, panes.length);
      let latest = start;

      const handleMove = (moveEvent: PointerEvent) => {
        const next = resizePanes(start, dividerIndex, moveEvent.clientX - startX, trackWidth);
        if (!next) return;
        latest = next;
        setDragFlex(next);
      };

      const handleUp = () => {
        globalThis.removeEventListener('pointermove', handleMove);
        globalThis.removeEventListener('pointerup', handleUp);
        setDragFlex(undefined);
        onResize(latest);
      };

      globalThis.addEventListener('pointermove', handleMove);
      globalThis.addEventListener('pointerup', handleUp);
    };

  return (
    <div className={styles.root} ref={rootRef}>
      {panes.map((pane, index) => (
        <Fragment key={pane.id}>
          {index > 0 && (
            <div
              className={styles.divider}
              style={{ inlineSize: DIVIDER_WIDTH }}
              onPointerDown={handleDividerDown(index - 1)}
            />
          )}
          <div
            className={styles.pane}
            data-inactive-pane={split && pane.id !== activePaneId ? '' : undefined}
            style={{ flex: `${flex[index]} 1 0` }}
            onPointerDownCapture={() => onActivatePane(pane.id)}
          >
            {split && (
              <div data-pane-close className={styles.close}>
                <ActionIcon
                  icon={XIcon}
                  size={{ blockSize: 20, size: 12 }}
                  title={t('terminalPanel.closePane')}
                  onClick={() => onClosePane(pane.id)}
                />
              </div>
            )}
            <TerminalView sessionId={pane.id} />
          </div>
        </Fragment>
      ))}
    </div>
  );
};

export default SplitView;
