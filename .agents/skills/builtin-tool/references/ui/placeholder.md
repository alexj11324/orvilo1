# Placeholder — Skeleton Between Args and Result (optional)

**Lifecycle:** rendered when the args have finished streaming but the executor hasn't returned yet. Disappears when `pluginState` arrives. Bridges the moment of perceived lag.

**Add for** APIs with noticeable execution time: web search, network crawl, file list, large grep. **Skip for** instant ops (status flips, calculator).

## Props (`BuiltinPlaceholderProps<Args>`)

```ts
interface BuiltinPlaceholderProps<T extends Record<string, any> = any> {
  apiName: string;
  args?: T;
  identifier: string;
}
```

No `pluginState` — Placeholder lives entirely in the "executing" gap.

## Canonical example — Search Placeholder

A new-code example based on the search placeholder shape; existing call sites may still be migrating:

```tsx
import type { BuiltinPlaceholderProps, SearchQuery } from '@orvilo/types';
import { cn } from 'cn';
import { SearchIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/useIsMobile';

export const Search = ({ args }: BuiltinPlaceholderProps<SearchQuery>) => {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('flex', isMobile ? 'flex-col gap-2' : 'flex-row gap-10')}>
        <div className="text-shiny flex items-center gap-2 rounded-(--radius-card) px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
          <SearchIcon aria-hidden className="size-4" />
          {args?.query || <Skeleton className="h-5 w-10" />}
        </div>
        <Skeleton className="h-5 w-10" />
      </div>
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map((id) => (
          <Skeleton className="h-20 w-40 rounded-(--radius-card)" key={id} />
        ))}
      </div>
    </div>
  );
};
```

## Placeholder rules

- **Mirror the eventual Render's layout.** When the result arrives the Placeholder unmounts and the Render mounts; if they share dimensions, the chat doesn't jump.
- Use the local `Skeleton` from `@/components/ui/skeleton`; component selection and sizing follow the [React skill](../../../react/SKILL.md).
- Embed any args you have (e.g. the query text) — context helps the user know what's loading.
- Use the shared `text-shiny` utility for literal loading text; keep the completed text unanimated.

## Placeholder registry — `client/Placeholder/index.ts`

```ts
import { WebBrowsingApiName } from '../../types';
import CrawlMultiPages from './CrawlMultiPages';
import CrawlSinglePage from './CrawlSinglePage';
import { Search } from './Search';

export const WebBrowsingPlaceholders = {
  [WebBrowsingApiName.crawlMultiPages]: CrawlMultiPages,
  [WebBrowsingApiName.crawlSinglePage]: CrawlSinglePage,
  [WebBrowsingApiName.search]: Search,
};

export { CrawlMultiPages, CrawlSinglePage, Search };
```
