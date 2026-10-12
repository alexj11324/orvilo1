'use client';

import { memo } from 'react';

import styles from './Video.module.css';

const containerClassName =
  'flex flex-col items-center justify-center h-full w-full p-4 rounded-(--radius-card) bg-card';

interface VideoViewerProps {
  fileId: string;
  url: string | null;
}

const VideoViewer = memo<VideoViewerProps>(({ url }) => {
  if (!url) return null;

  return (
    <div className={containerClassName}>
      <video controls className={styles.video} height={'100%'} src={url} width={'100%'} />
    </div>
  );
});

export default VideoViewer;
