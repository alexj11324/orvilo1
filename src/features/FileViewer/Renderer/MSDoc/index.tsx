'use client';

import { memo } from 'react';

// Office's embedded frame keeps its two fixed hairline clipping edges.
const content = 'absolute -inset-y-px -start-px h-[calc(100%+2px)] w-[calc(100%+2px)] border-0';

interface MSDocViewerProps {
  fileId: string;
  url: string | null;
}

const MSDocViewer = memo<MSDocViewerProps>(({ url }) => {
  if (!url) return null;

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-(--radius-card)"
      id="msdoc-renderer"
    >
      <iframe
        className={content}
        id="msdoc-iframe"
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
        title="msdoc-iframe"
      />
    </div>
  );
});

export default MSDocViewer;
