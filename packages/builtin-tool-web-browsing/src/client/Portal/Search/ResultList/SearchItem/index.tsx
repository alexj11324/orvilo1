import { isDesktop } from '@orvilo/const';
import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import type { UniformSearchResult } from '@orvilo/types';
import { cn } from 'cn';
import type { MouseEvent } from 'react';
import { memo } from 'react';

import WebFavicon from '@/components/WebFavicon';
import { useGlobalStore } from '@/store/global';

import TitleExtra from './TitleExtra';
import Video from './Video';

const styles = {
  container: 'flex flex-1 p-2 rounded-[var(--radius-card)] [color:initial] hover:bg-accent',
  desc: 'line-clamp-2 text-ellipsis text-[var(--ant-color-text-tertiary)]',
  title: 'text-base leading-[inherit] text-[var(--ant-color-link)]',
  url: 'line-clamp-1 text-ellipsis text-[var(--ant-color-text-description)]',
};

interface SearchResultProps extends UniformSearchResult {
  highlight?: boolean;
}

const SearchItem = memo<SearchResultProps>((props) => {
  const { content, url, score, engines, title, category } = props;
  const openInBrowserTab = useGlobalStore((s) => s.openInBrowserTab);

  // Only claim the click when this onClick will actually handle it. Otherwise the
  // anchor's default behavior — and the desktop preload's external-link branch —
  // opens the system browser.
  const handlesClick = isDesktop && !!url;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!handlesClick) return;

    event.preventDefault();
    openInBrowserTab(url!);
  };

  if (category === 'videos') return <Video {...props} />;

  return (
    <a
      {...(handlesClick ? { [RENDERER_HANDLED_LINK_ATTR]: 'true' } : {})}
      className={styles.container}
      href={url!}
      rel="noreferrer"
      target={'_blank'}
      onClick={handleClick}
    >
      <div className="flex flex-col justify-between flex-1 gap-2 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-center gap-2">
              <WebFavicon title={title} url={url} />
              <div className={cn('flex flex-col', styles.title)}>{title}</div>
            </div>
            <TitleExtra
              category={category}
              engines={engines}
              highlight={props.highlight}
              score={score}
            />
          </div>
          <div className={styles.url}>{url}</div>
          <div className={styles.desc}>{content}</div>
        </div>
      </div>
    </a>
  );
});

export default SearchItem;
