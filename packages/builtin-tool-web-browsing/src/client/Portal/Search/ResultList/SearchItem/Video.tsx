import type { UniformSearchResult } from '@orvilo/types';
import { cn } from 'cn';
import { memo, useState } from 'react';

import AvatarGroup from '@/components/Avatar/AvatarGroup';

import { ENGINE_ICON_MAP } from '../../../../../const';
import TitleExtra from './TitleExtra';

const styles = {
  container: 'flex flex-1 p-2 rounded-[var(--radius-card)] [color:initial] hover:bg-accent',
  desc: 'line-clamp-2 text-ellipsis text-[var(--ant-color-text-tertiary)]',
  iframe: 'border border-border rounded-[var(--radius-card)]',
  title: 'line-clamp-1 text-ellipsis text-base leading-[inherit] text-[var(--ant-color-link)]',
  url: 'line-clamp-1 text-ellipsis text-[var(--ant-color-text-description)]',
};

interface SearchResultProps extends UniformSearchResult {
  highlight?: boolean;
}
const VideoItem = memo<SearchResultProps>(
  ({ content, url, iframeSrc, highlight, score, engines, title, category, ...res }) => {
    const [expand, setExpand] = useState(false);

    const videoUrl = iframeSrc || (res as any).iframe_src; // iframe_src is a SearchXNG field, for backward compatibility with old data structure
    return (
      <div className="flex flex-col gap-3">
        <div className={cn('flex flex-col', styles.container)} onClick={() => setExpand(!expand)}>
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
                  <AvatarGroup
                    shape={'circle'}
                    size={20}
                    items={engines.map((engine) => ({
                      avatar: ENGINE_ICON_MAP[engine],
                      background: 'var(--background)',
                      key: engine,
                      title: engine,
                    }))}
                  />
                  <div className={styles.title}>{title}</div>
                </div>
                <TitleExtra
                  category={category}
                  engines={engines}
                  highlight={highlight}
                  score={score}
                />
              </div>
              <div className={styles.url}>{url}</div>
              <div className={styles.desc}>{content}</div>
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
