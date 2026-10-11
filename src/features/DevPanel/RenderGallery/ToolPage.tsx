'use client';

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

const styles = {
  body: 'w-full',
  // Keep anchored previews clear of the sticky lifecycle bar.
  content: "relative overflow-auto flex-1 [&_[id^='api-']]:scroll-mbs-20",
  controlGroup: 'gap-2 items-center min-w-0',
  // Tabs claim the row width; the label must not shrink into mid-word wrapping.
  controlLabel: 'shrink-0 whitespace-nowrap',
  controlTabs: "min-w-0 [&_[role='tablist']]:flex-wrap",
  empty: 'flex-1 gap-1.5 items-center justify-center text-sm leading-5.5 text-foreground-tertiary',
  header: 'gap-2 p-3 border-be border-divider',
  modeBar:
    'sticky z-2 inset-bs-0 gap-4 items-center min-h-11 py-1.5 px-3 border-be border-divider bg-card',
};

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
    <div className="flex h-full w-full overflow-hidden">
      {view === 'api' && (
        <ApiList activeApiName={activeApi} apis={toolset.apis} onSelect={handleSelect} />
      )}
      <div className={styles.content} ref={scrollRef}>
        <div className={cn(styles.body, 'flex flex-col')}>
          <div className={cn(styles.header, 'flex flex-col')}>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-2xl leading-8 font-semibold">{toolset.toolsetName}</div>
              <Tag>{toolset.identifier}</Tag>
              <div className="text-xs leading-5 text-muted-foreground">
                {toolset.apis.length} API{toolset.apis.length === 1 ? '' : 's'}
              </div>
            </div>
            {toolset.toolsetDescription && (
              <div className="text-sm leading-5.5 text-muted-foreground">
                {toolset.toolsetDescription}
              </div>
            )}
          </div>

          <div className={cn(styles.modeBar, 'flex flex-wrap')}>
            <div className={cn(styles.controlGroup, 'flex')}>
              <div
                className={cn(
                  'text-xs',
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
            <div className={cn(styles.controlGroup, 'flex')}>
              <div
                className={cn(
                  'text-xs',
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
