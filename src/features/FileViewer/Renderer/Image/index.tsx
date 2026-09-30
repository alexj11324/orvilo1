'use client';

import { memo, useState } from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';

interface ImageViewerProps {
  fileId: string;
  url: string | null;
}

const ImageViewer = memo<ImageViewerProps>(({ url }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  if (!url) return null;

  return (
    <div className="flex flex-col items-center justify-center h-[100%] w-[100%]">
      {!isLoaded && <NeuralNetworkLoading size={36} />}
      {}
      <img
        alt="Image preview"
        src={url}
        style={{
          display: isLoaded ? 'block' : 'none',
          height: '100%',
          objectFit: 'contain',
          overflow: 'hidden',
          width: '100%',
        }}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
});

export default ImageViewer;
