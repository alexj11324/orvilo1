import { Avatar, Text } from '@lobehub/ui/base-ui';
import type { UniformSearchResult } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo, useState } from 'react';

import { ENGINE_ICON_MAP } from '../../../../../const';
import TitleExtra from './TitleExtra';

const styles = createStaticStyles(({ css }) => {
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
    iframe: css`
      border: 1px solid ${cssVar.colorBorder};
      border-radius: 8px;
    `,
    title: css`
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;

      font-size: 16px;
      color: ${cssVar.colorLink};
      text-overflow: ellipsis;
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
const VideoItem = memo<SearchResultProps>(
  ({ content, url, iframeSrc, highlight, score, engines, title, category, ...res }) => {
    const [expand, setExpand] = useState(false);

    const videoUrl = iframeSrc || (res as any).iframe_src; // iframe_src is a SearchXNG field, for backward compatibility with old data structure
    return (
      <div className="flex flex-col gap-3">
        <div className={cx('flex flex-col', styles.container)} onClick={() => setExpand(!expand)}>
          <div className="flex flex-row flex-1 gap-2 p-3">
            {videoUrl && (
              <div className="flex flex-col">
                <iframe
                  // alt={title}
                  className={styles.iframe}
                  height={100}
                  src={videoUrl}
                  width={200}
                  style={{
                    pointerEvents: 'none',
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onPlay={(e) => {
                    e.preventDefault();
                  }}
                />
              </div>
            )}
            <div className="flex flex-col flex-1 gap-2">
              <div className="flex flex-row items-center justify-between gap-3">
                <div className="flex flex-row items-center gap-2">
                  <Avatar.Group
                    shape={'circle'}
                    size={20}
                    items={engines.map((engine) => ({
                      avatar: ENGINE_ICON_MAP[engine],
                      background: cssVar.colorBgLayout,
                      key: engine,
                      title: engine,
                    }))}
                  />
                  <div className={cx('flex flex-col', styles.title)}>{title}</div>
                </div>
                <TitleExtra
                  category={category}
                  engines={engines}
                  highlight={highlight}
                  score={score}
                />
              </div>
              <Text className={styles.url} type={'secondary'}>
                {url}
              </Text>
              <div className={cx('flex flex-col', styles.desc)}>{content}</div>
            </div>
          </div>
        </div>
        {expand && videoUrl && (
          <div className="flex flex-col">
            <iframe className={styles.iframe} height={440} src={videoUrl} width={'100%'} />
          </div>
        )}
      </div>
    );
  },
);

export default VideoItem;
