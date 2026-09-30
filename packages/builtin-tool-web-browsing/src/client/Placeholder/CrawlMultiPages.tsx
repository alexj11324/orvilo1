'use client';

import type { BuiltinPlaceholderProps } from '@orvilo/types';
import { memo } from 'react';

import { useIsMobile } from '@/hooks/useIsMobile';

import LoadingCard from '../Render/PageContent/Loading';

const CrawlMultiPages = memo<BuiltinPlaceholderProps<{ urls: string[] }>>(({ args }) => {
  const urls = args?.urls;

  const isMobile = useIsMobile();

  return (
    <div
      className={`flex overflow-x-auto ${isMobile ? 'flex-col' : 'flex-row'}`}
      style={{ gap: isMobile ? 4 : 12 }}
    >
      {urls &&
        urls.length > 0 &&
        urls.map((url, index) => <LoadingCard key={`${index}_${url}`} url={url} />)}
    </div>
  );
});

export default CrawlMultiPages;
