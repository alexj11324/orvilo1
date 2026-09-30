'use client';

import { css, cx } from 'antd-style';
import { memo } from 'react';

const container = css`
  position: relative;
  overflow: hidden;
  border-radius: 4px;
`;

const content = css`
  position: absolute;
  inset-block: -1px;
  inset-inline-start: -1px;

  width: calc(100% + 2px);
  height: calc(100% + 2px);
  border: 0;
`;

interface MSDocViewerProps {
  fileId: string;
  url: string | null;
}

const MSDocViewer = memo<MSDocViewerProps>(({ url }) => {
  if (!url) return null;

  return (
    <div className={cx('flex flex-col h-[100%] w-[100%]', cx(container))} id="msdoc-renderer">
      <iframe
        className={cx(content)}
        id="msdoc-iframe"
        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
        title="msdoc-iframe"
      />
    </div>
  );
});

export default MSDocViewer;
