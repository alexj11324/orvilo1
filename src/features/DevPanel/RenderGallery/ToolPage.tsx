'use client';

import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { useEffect, useRef, useState } from 'react';

import { Badge as Tag } from '@/components/reui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import ApiList from './ApiList';
import { LIFECYCLE_MODE_LABEL, LIFECYCLE_MODES, type LifecycleMode } from './lifecycleMode';
import MessageList from './MessageList';
import ToolPreview from './ToolPreview';
import { toApiAnchor, type ToolsetEntry } from './useDevtoolsEntries';

const MODE_STORAGE_KEY = 'devtools-render-gallery:lifecycle-mode';
const VIEW_STORAGE_KEY = 'devtools-render-gallery:view';

type GalleryView = 'api' | 'aggregate';

const isLifecycleMode = (value: string | null): value is LifecycleMode =>
  !!value && (LIFECYCLE_MODES as string[]).includes(value);

const isGalleryView = (value: string | null): value is GalleryView =>
  value === 'api' || value === 'aggregate';

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    width: 100%;
  `,
  content: css`
    position: relative;
    overflow: auto;
    flex: 1;

    /* keep a jumped-to card clear of the sticky lifecycle bar */
    & [id^='api-'] {
      scroll-margin-block-start: 80px;
    }
  `,
  controlGroup: css`
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
  /*
   * The label sits next to a Tabs whose root is `width: 100%`, so the tabs claim the
   * whole row and the label absorbs every pixel of shrink. With the app-wide
   * `overflow-wrap: anywhere`, its min-content width is one character, so it breaks
   * mid-word ("Vie / w"). Keep the guard on the label itself, not on the row.
   */
  controlLabel: css`
    flex-shrink: 0;
    white-space: nowrap;
  `,
  /* Let the modes wrap onto a second row instead of overflowing a narrow panel. */
  controlTabs: css`
    min-width: 0;

    [role='tablist'] {
      flex-wrap: wrap;
    }
  `,
  empty: css`
    flex: 1;
    gap: 6px;
    align-items: center;
    justify-content: center;

    color: ${cssVar.colorTextTertiary};
  `,
  header: css`
    gap: 8px;
    padding: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  modeBar: css`
    position: sticky;
    z-index: 2;
    inset-block-start: 0;

    gap: 16px;
    align-items: center;

    min-height: 44px;
    padding-block: 6px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
}));

interface DevtoolsToolPageProps {
  toolset: ToolsetEntry;
}

const DevtoolsToolPage = ({ toolset }: DevtoolsToolPageProps) => {
  const [mode, setMode] = useState<LifecycleMode>('success');
  const [view, setView] = useState<GalleryView>('api');
  const [activeApi, setActiveApi] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage so the choices survive navigation between toolsets.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (isLifecycleMode(storedMode)) setMode(storedMode);
    const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (isGalleryView(storedView)) setView(storedView);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // Scrollspy (per-API view only): highlight the API-list item for the card the
  // reader is on — the last card whose top has crossed a trigger line just under
  // the sticky bar. A plain scroll listener (rAF-throttled) is used instead of
  // an IntersectionObserver so the boundary cases stay exact: at the very bottom
  // the last card can't reach the trigger line, and at the very top the first
  // card sits above it, so both ends are pinned explicitly.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || view !== 'api') return;

    const apiNames = toolset.apis.map((api) => api.apiName);

    // Honor a deep-link hash (#api-<name>) on load; otherwise start at the top.
    const hash = window.location.hash.replace(/^#/, '');
    const linked = apiNames.find((name) => toApiAnchor(name) === hash);
    if (linked) {
      setActiveApi(linked);
      const card = root.querySelector(`#${CSS.escape(toApiAnchor(linked))}`);
      requestAnimationFrame(() => card?.scrollIntoView({ block: 'start' }));
    } else {
      setActiveApi(apiNames[0]);
      root.scrollTo({ top: 0 });
    }

    const TRIGGER = 96; // px below the scroll-area top — clears the sticky bar
    let frame = 0;

    const compute = () => {
      frame = 0;
      if (root.scrollTop <= 0) return setActiveApi(apiNames[0]);
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2)
        return setActiveApi(apiNames.at(-1));

      const rootTop = root.getBoundingClientRect().top;
      let current = apiNames[0];
      for (const name of apiNames) {
        const el = document.getElementById(toApiAnchor(name));
        if (!el) continue;
        if (el.getBoundingClientRect().top - rootTop <= TRIGGER) current = name;
        else break;
      }
      setActiveApi(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [toolset, view]);

  const handleSelect = (apiName: string) => {
    setActiveApi(apiName);
    const root = scrollRef.current;
    const card = root?.querySelector(`#${CSS.escape(toApiAnchor(apiName))}`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Pin a shareable anchor without spamming browser history.
    window.history.replaceState(null, '', `#${toApiAnchor(apiName)}`);
  };

  return (
    <div className="flex h-full w-full" style={{ overflow: 'hidden' }}>
      {view === 'api' && (
        <ApiList activeApiName={activeApi} apis={toolset.apis} onSelect={handleSelect} />
      )}
      <div className={styles.content} ref={scrollRef}>
        <div className={cx(styles.body, 'flex flex-col')}>
          <div className={cx(styles.header, 'flex flex-col')}>
            <div className="flex items-center gap-2.5" style={{ flexWrap: 'wrap' }}>
              <div className="text-[22px] font-bold">{toolset.toolsetName}</div>
              <Tag>{toolset.identifier}</Tag>
              <div className="text-[12px] text-muted-foreground">
                {toolset.apis.length} API{toolset.apis.length === 1 ? '' : 's'}
              </div>
            </div>
            {toolset.toolsetDescription && (
              <div className="text-[13px] text-muted-foreground">{toolset.toolsetDescription}</div>
            )}
          </div>

          <div className={cx(styles.modeBar, 'flex')} style={{ flexWrap: 'wrap' }}>
            <div className={cx(styles.controlGroup, 'flex')}>
              <div
                className={cn(
                  'text-[12px]',
                  'text-muted-foreground',
                  'font-semibold',
                  styles.controlLabel,
                )}
              >
                View
              </div>
              <Tabs
                className={styles.controlTabs}
                value={view}
                onValueChange={(key) => {
                  if (typeof key === 'string') setView(key as GalleryView);
                }}
              >
                <TabsList>
                  <TabsTrigger value="api">By API</TabsTrigger>
                  <TabsTrigger value="aggregate">Aggregate</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className={cx(styles.controlGroup, 'flex')}>
              <div
                className={cn(
                  'text-[12px]',
                  'text-muted-foreground',
                  'font-semibold',
                  styles.controlLabel,
                )}
              >
                Lifecycle
              </div>
              <Tabs
                className={styles.controlTabs}
                value={mode}
                onValueChange={(key) => {
                  if (typeof key === 'string') setMode(key as LifecycleMode);
                }}
              >
                <TabsList>
                  {LIFECYCLE_MODES.map((value) => (
                    <TabsTrigger key={value} value={value}>
                      {LIFECYCLE_MODE_LABEL[value]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>

          {view === 'api' &&
            toolset.apis.map((api) => (
              <ToolPreview api={api} key={`${api.identifier}:${api.apiName}`} mode={mode} />
            ))}
        </div>

        {view === 'aggregate' && <MessageList apis={toolset.apis} mode={mode} />}
      </div>
    </div>
  );
};

export default DevtoolsToolPage;
