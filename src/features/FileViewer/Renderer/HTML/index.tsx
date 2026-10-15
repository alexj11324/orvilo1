'use client';

import { memo } from 'react';

import { InlineHtmlPreview } from '@/components/HtmlPreview';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';

import { useTextFileLoader } from '../../hooks/useTextFileLoader';

interface HTMLViewerProps {
  fileId: string;
  url: string | null;
}

const HTMLViewer = memo<HTMLViewerProps>(({ url }) => {
  const { fileData, loading } = useTextFileLoader(url);

  return (
    <div className={'flex flex-col w-full h-full p-0'}>
      {!loading && fileData !== null ? (
        <InlineHtmlPreview content={fileData} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full">
          <NeuralNetworkLoading size={36} />
        </div>
      )}
    </div>
  );
});

HTMLViewer.displayName = 'HTMLViewer';

export default HTMLViewer;
