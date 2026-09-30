'use client';

import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding: ${cssVar.paddingSM};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  video: css`
    max-width: 100%;
    max-height: 100%;
    border-radius: ${cssVar.borderRadius};

    object-fit: contain;
    box-shadow: ${cssVar.boxShadowTertiary};

    &::-webkit-media-controls-panel {
      background: linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 30%) 100%);
    }

    &:focus {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
}));

interface VideoViewerProps {
  fileId: string;
  url: string | null;
}

const VideoViewer = memo<VideoViewerProps>(({ url }) => {
  if (!url) return null;

  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center h-[100%] w-[100%]',
        styles.container,
      )}
    >
      <video controls className={styles.video} height={'100%'} src={url} width={'100%'} />
    </div>
  );
});

export default VideoViewer;
