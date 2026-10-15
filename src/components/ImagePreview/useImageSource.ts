import { useEffect, useState } from 'react';

/** Native img accepts Blob sources through an owned URL that is revoked on replacement/unmount. */
export const useImageSource = (source: string | Blob | undefined): string | undefined => {
  const [resolved, setResolved] = useState<{ source: Blob; url: string }>();
  useEffect(() => {
    if (typeof source !== 'object') return;
    const url = URL.createObjectURL(source);
    setResolved({ source, url });
    return () => URL.revokeObjectURL(url);
  }, [source]);
  return typeof source === 'string'
    ? source
    : resolved?.source === source
      ? resolved?.url
      : undefined;
};
