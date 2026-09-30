import { Text } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import { RENDERER_HANDLED_LINK_ATTR } from '@orvilo/desktop-bridge';
import type { UniformSearchResult } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import type { MouseEvent } from 'react';
import { memo } from 'react';

import WebFavicon from '@/components/WebFavicon';
import { useGlobalStore } from '@/store/global';

import TitleExtra from './TitleExtra';
import Video from './Video';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    container: css`
      display: flex;
      flex: 1;

      padding: 8px;
      border-radius: 8px;

      color: initial;

      &:hover {
        background: ${cssVar.colorFillTertiary};
      }
    `,
    desc: css`
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;

      color: ${cssVar.colorTextTertiary};
      text-overflow: ellipsis;
    `,
    displayLink: css`
      color: ${cssVar.colorTextQuaternary};
    `,
    title: css`
      font-size: 16px;
      color: ${cssVar.colorLink};
    `,
    url: css`
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;

      color: ${cssVar.colorTextDescription};
      text-overflow: ellipsis;
    `,
  };
});

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
              <div className={cx('flex flex-col', styles.title)}>{title}</div>
            </div>
            <TitleExtra
              category={category}
              engines={engines}
              highlight={props.highlight}
              score={score}
            />
          </div>
          <Text className={styles.url} type={'secondary'}>
            {url}
          </Text>
          <div className={cx('flex flex-col', styles.desc)}>{content}</div>
        </div>
      </div>
    </a>
  );
});

export default SearchItem;
