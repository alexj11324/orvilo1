'use client';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { cx } from 'antd-style';
import { Fragment, memo, useCallback, useState } from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Document, Page, pdfjs } from '@/libs/pdfjs';
import { lambdaQuery } from '@/libs/trpc/client';

import HighlightLayer from './HighlightLayer';
import { styles } from './style';
import useResizeObserver from './useResizeObserver';

const options = {
  cMapUrl: `https://registry.npmmirror.com/pdfjs-dist/${pdfjs.version}/files/cmaps/`,
  standardFontDataUrl: `https://registry.npmmirror.com/pdfjs-dist/${pdfjs.version}/files/standard_fonts/`,
};

const maxWidth = 1200;

export interface PDFViewerProps {
  fileId: string;
  url: string | null;
}

const PDFViewer = memo<PDFViewerProps>(({ url, fileId }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [isLoaded, setIsLoaded] = useState(false);

  const onResize = useCallback<ResizeObserverCallback>((entries) => {
    const [entry] = entries;

    if (entry) {
      setContainerWidth(entry.contentRect.width);
    }
  }, []);

  useResizeObserver(containerRef, onResize);

  const onDocumentLoadSuccess = (document: unknown) => {
    setNumPages((document as { numPages: number }).numPages);
    setIsLoaded(true);
  };

  const { data } = lambdaQuery.chunk.getChunksByFileId.useInfiniteQuery(
    { id: fileId },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );

  const dataSource = data?.pages.flatMap((page) => page.items) || [];

  return (
    <div className={cx('flex flex-col', styles.container)}>
      <div
        className={cx('flex flex-col items-center p-6', styles.documentContainer)}
        ref={setContainerRef}
        style={{ justifyContent: isLoaded ? undefined : 'center' }}
      >
        <Document
          className={styles.document}
          file={url}
          loading={<NeuralNetworkLoading size={36} />}
          options={options}
          onLoadSuccess={onDocumentLoadSuccess}
        >
          {Array.from({ length: numPages }, (_, index) => {
            const width = containerWidth ? Math.min(containerWidth, maxWidth) : maxWidth;

            return (
              <Fragment key={`page_${index + 1}`}>
                <Page className={styles.page} pageNumber={index + 1} width={width}>
                  <HighlightLayer dataSource={dataSource} pageNumber={index + 1} width={width} />
                </Page>
              </Fragment>
            );
          })}
        </Document>
      </div>
    </div>
  );
});

export default PDFViewer;
