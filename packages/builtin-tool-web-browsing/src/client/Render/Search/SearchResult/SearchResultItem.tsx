import { isDesktop } from '@orvilo/const';
import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import type { UniformSearchResult } from '@orvilo/types';
import { cn } from 'cn';
import type { CSSProperties, MouseEvent } from 'react';
import { memo } from 'react';

import WebFavicon from '@/components/WebFavicon';
import { useGlobalStore } from '@/store/global';

const styles = {
  container: 'cursor-pointer h-full p-2 text-xs leading-[inherit] [color:initial]',
};

const SearchResultItem = memo<UniformSearchResult & { style?: CSSProperties }>(
  ({ url, title, style }) => {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const openInBrowserTab = useGlobalStore((s) => s.openInBrowserTab);

    // Only claim the click when this onClick will actually handle it. Otherwise the
    // anchor's default behavior — and the desktop preload's external-link branch —
    // opens the system browser.
    const handlesClick = isDesktop;

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (!handlesClick) return;

      event.preventDefault();
      openInBrowserTab(url);
    };

    return (
      <a
        {...(handlesClick ? { [RENDERER_HANDLED_LINK_ATTR]: 'true' } : {})}
        href={url}
        target={'_blank'}
        onClick={handleClick}
      >
        <div
          style={style}
          className={cn(
            styles.container,
            'flex flex-col gap-0.5 justify-between rounded-md border bg-card cursor-pointer',
          )}
        >
          <div className="line-clamp-2">{title}</div>
          <div className="flex flex-row items-center gap-1">
            <WebFavicon size={14} title={title} url={url} />
            <div className="truncate text-muted-foreground">{host.replace('www.', '')}</div>
          </div>
        </div>
      </a>
    );
  },
);

export default SearchResultItem;
