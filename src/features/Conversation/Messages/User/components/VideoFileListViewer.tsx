import { memo } from 'react';

import { type ChatVideoItem } from '@/types/index';

interface VideoFileListViewerProps {
  items: ChatVideoItem[];
}

const VideoFileListViewer = memo<VideoFileListViewerProps>(({ items }) => {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <video
          controls
          key={item.id}
          style={{
            borderRadius: 8,
            maxHeight: 400,
            maxWidth: '100%',
          }}
        >
          <source src={item.url} />
          {item.alt}
        </video>
      ))}
    </div>
  );
});

export default VideoFileListViewer;
