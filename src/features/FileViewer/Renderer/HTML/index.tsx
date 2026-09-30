'use client';

import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import { InlineHtmlPreview } from '@/components/HtmlPreview';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';

import { useTextFileLoader } from '../../hooks/useTextFileLoader';

const styles = createStaticStyles(({ css }) => ({
  page: css`
    width: 100%;
    height: 100%;
    padding: 0;
  `,
}));

interface HTMLViewerProps {
  fileId: string;
  url: string | null;
}

const HTMLViewer = memo<HTMLViewerProps>(({ url }) => {
  const { fileData, loading } = useTextFileLoader(url);

  return (
    <div className={cx('flex flex-col', styles.page)}>
      {!loading && fileData !== null ? (
        <InlineHtmlPreview content={fileData} />
      ) : (
        <div className="flex flex-col items-center justify-center h-[100%]">
          <NeuralNetworkLoading size={36} />
        </div>
      )}
    </div>
  );
});

HTMLViewer.displayName = 'HTMLViewer';

export default HTMLViewer;
