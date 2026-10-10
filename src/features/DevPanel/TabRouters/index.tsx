'use client';

import { cn } from 'cn';
import { memo } from 'react';

import { devDockPanelStyles } from '@/features/DevDock/panelStyles';
import { useElectronStore } from '@/store/electron';

import { type TabRouterRow, useTabRouterDebug } from './useTabRouterDebug';

const styles = {
  cell: 'truncate',
  cold: 'text-foreground-quaternary',
  drift: 'text-warning-text',
  empty: 'p-6 text-sm leading-5.5 text-foreground-tertiary text-center',
  head: 'sticky z-1 top-0 text-foreground-quaternary uppercase tracking-[0.04em] bg-card hover:bg-card',
  legend:
    'shrink-0 pt-2 pb-3 px-3 border-t border-divider text-xs leading-5 text-foreground-quaternary',
  muted: 'text-foreground-tertiary',
  next: 'text-destructive-text',
  ok: 'text-success-text',
  row: 'cursor-pointer grid grid-cols-[24px_96px_68px_1fr_1fr_44px_76px_52px] gap-2 items-center min-h-8 py-1.5 px-3 border-b border-divider font-mono text-xs leading-5 tabular-nums hover:bg-fill-quaternary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  rowActive: 'bg-selected hover:bg-selected',
  rows: 'overflow-auto flex-1 min-h-0',
  summary:
    'shrink-0 py-2 px-3 border-b border-divider font-mono text-xs leading-5 text-muted-foreground',
};

const formatAge = (timestamp: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
};

const Row = memo<{ index: number; nextEvicted: boolean; row: TabRouterRow }>(
  ({ index, nextEvicted, row }) => {
    const activateTab = useElectronStore((s) => s.activateTab);
    const state = row.active ? 'ACTIVE' : row.live ? 'LIVE' : 'COLD';

    return (
      <div
        className={cn(styles.row, row.active && styles.rowActive)}
        role={'button'}
        tabIndex={0}
        onClick={() => activateTab(row.id)}
        onKeyDown={(e) => e.key === 'Enter' && activateTab(row.id)}
      >
        <span className={styles.muted}>{index + 1}</span>
        <span className={cn(styles.cell, styles.muted)} title={row.id}>
          {row.id}
        </span>
        <span className={row.live ? styles.ok : styles.cold}>
          {state}
          {row.live !== row.shouldBeLive && '!'}
        </span>
        <span
          className={styles.cell}
          title={row.title ? `${row.title} — ${row.storeUrl}` : row.storeUrl}
        >
          {row.storeUrl}
        </span>
        <span
          className={cn(styles.cell, row.drift ? styles.drift : styles.muted)}
          title={row.routerUrl ?? 'router disposed'}
        >
          {row.live ? (row.drift ? row.routerUrl : '=') : '—'}
        </span>
        <span className={styles.muted}>
          {row.canGoBack ? '◀' : '·'}
          {row.canGoForward ? '▶' : '·'}
        </span>
        <span className={styles.muted}>{formatAge(row.lastVisited)}</span>
        <span className={nextEvicted ? styles.next : styles.muted}>
          #{row.rank}
          {nextEvicted && '↓'}
        </span>
      </div>
    );
  },
);

Row.displayName = 'DevTabRoutersRow';

const TabRouters = memo(() => {
  const { cap, liveCount, orphanIds, rows, scopeKey } = useTabRouterDebug();

  const evictable = rows.filter((row) => row.live && !row.active);
  const nextEvictedId =
    liveCount >= cap && evictable.length > 0
      ? evictable.reduce((oldest, row) => (row.rank > oldest.rank ? row : oldest)).id
      : null;

  return (
    <div className={cn(devDockPanelStyles.root, 'flex flex-col')}>
      <div className={styles.summary}>
        scope <b>{scopeKey}</b> · tabs <b>{rows.length}</b> · live routers{' '}
        <b className={liveCount > cap ? styles.drift : undefined}>
          {liveCount}/{cap}
        </b>
        {orphanIds.length > 0 && (
          <span className={styles.drift}> · orphan routers {orphanIds.join(', ')}</span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className={styles.empty}>No tabs in this scope.</div>
      ) : (
        <div className={styles.rows}>
          <div className={cn(styles.row, styles.head)}>
            <span>#</span>
            <span>tab id</span>
            <span>state</span>
            <span>store url</span>
            <span>router url</span>
            <span>hist</span>
            <span>visited</span>
            <span>lru</span>
          </div>
          {rows.map((row, index) => (
            <Row index={index} key={row.id} nextEvicted={row.id === nextEvictedId} row={row} />
          ))}
        </div>
      )}
      <div className={styles.legend}>
        ACTIVE / LIVE = keep-alive router in memory, COLD = disposed (next activation cold-starts).
        `!` marks a router whose liveness disagrees with the LRU plan. Router url shows `=` when it
        matches the store url, or the diverging location when a hidden tab navigated. `lru` is the
        recency rank; `↓` marks the router evicted next. Click a row to activate that tab.
      </div>
    </div>
  );
});

TabRouters.displayName = 'DevTabRouters';

export default TabRouters;
