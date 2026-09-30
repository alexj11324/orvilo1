'use client';

import { createStaticStyles, cx } from 'antd-style';
import { ChevronLeft, ChevronRight, Expand, FileText } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Document, Page } from '@/libs/pdfjs';

import { containerStyles } from '../style';

const styles = createStaticStyles(({ css }) => ({
  containerWrapper: css`
    position: relative;
    width: 100%;
    height: 100%;
  `,
  documentLoading: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    height: 100%;
    padding: 20px;
  `,
  emptyState: css`
    display: flex;
    align-items: center;
    justify-content: center;

    height: 100%;

    color: #666;
  `,
  expandButton: css`
    position: absolute;
    z-index: 1000;
    inset-block-start: 20px;
    inset-inline-end: 20px;
  `,
  footerNavigation: css`
    position: absolute;
    z-index: 10;
    inset-block-end: 0;
    inset-inline: 0;

    padding: 12px;
    border-block-start: 1px solid color-mix(in srgb, black 10%, transparent);

    background: color-mix(in srgb, white 90%, transparent);
    backdrop-filter: blur(8px);
  `,
  fullscreenButton: css`
    border-color: white;
    color: white;
  `,
  fullscreenContent: css`
    display: flex;
    align-items: flex-start;
    justify-content: center;

    min-height: 100%;
    padding: 20px;
  `,
  fullscreenModal: css`
    position: relative;
    overflow: auto;
    height: 90vh;
  `,
  fullscreenNavigation: css`
    position: fixed;
    z-index: 1001;
    inset-block-end: 20px;
    inset-inline-start: 50%;
    transform: translateX(-50%);

    padding-block: 12px;
    padding-inline: 20px;
    border-radius: 8px;

    background: color-mix(in srgb, black 70%, transparent);
    backdrop-filter: blur(8px);
  `,
  fullscreenPageInput: css`
    width: 60px;
    text-align: center;
  `,
  fullscreenPageText: css`
    min-width: 20px;
    font-size: 14px;
    color: white;
  `,
  loadingState: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    height: 100%;
  `,
  loadingText: css`
    margin-block-start: 8px;
    color: #666;
  `,
  pageInput: css`
    width: 50px;
    text-align: center;
  `,
  pageNumberText: css`
    font-size: 12px;
    color: #666;
  `,
  previewContainer: css`
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 12px;
  `,
}));

interface FullscreenContentProps {
  initialPage: number;
  pdfDataUri: string;
}

const FullscreenContent = memo<FullscreenContentProps>(({ pdfDataUri, initialPage }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);

  const goToPrev = () => {
    if (pageNumber > 1) setPageNumber(pageNumber - 1);
  };

  const goToNext = () => {
    if (pageNumber < numPages) setPageNumber(pageNumber + 1);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) setPageNumber(page);
  };

  return (
    <div className={styles.fullscreenModal}>
      <div className={styles.fullscreenContent}>
        <Document
          file={pdfDataUri}
          onLoadSuccess={({ numPages: total }: { numPages: number }) => setNumPages(total)}
        >
          <Page
            pageNumber={pageNumber}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            width={Math.min(window.innerWidth * 0.8, 1000)}
          />
        </Document>
      </div>

      {numPages > 1 && (
        <div className={styles.fullscreenNavigation}>
          <div className="flex flex-row items-center gap-3">
            <Button
              className={cn(styles.fullscreenButton)}
              disabled={pageNumber <= 1}
              size="icon-sm"
              variant="ghost"
              onClick={goToPrev}
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex flex-row items-center gap-2">
              <Input
                className={styles.fullscreenPageInput}
                max={numPages}
                min={1}
                type="number"
                value={pageNumber}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) goToPage(value);
                }}
              />
              <span className={styles.fullscreenPageText}>/ {numPages}</span>
            </div>
            <Button
              className={cn(styles.fullscreenButton)}
              disabled={pageNumber >= numPages}
              size="icon-sm"
              variant="ghost"
              onClick={goToNext}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

FullscreenContent.displayName = 'PdfFullscreenContent';

const openPdfFullscreenModal = (pdfDataUri: string, initialPage: number) =>
  createModal({
    content: <FullscreenContent initialPage={initialPage} pdfDataUri={pdfDataUri} />,
    footer: null,
    maskClosable: true,
    styles: {
      content: { padding: 0 },
      header: { display: 'none' },
    },
    width: '95vw',
  });

interface PdfPreviewProps {
  loading: boolean;
  onGeneratePdf?: () => void;
  pdfData: string | null;
}

const PdfPreview = memo<PdfPreviewProps>(({ loading, pdfData, onGeneratePdf }) => {
  const localStyles = styles;
  const { t } = useTranslation('chat');
  const isMobile = useIsMobile();

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const goToPrevPage = () => {
    if (pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    }
  };

  const goToNextPage = () => {
    if (pageNumber < numPages) {
      setPageNumber(pageNumber + 1);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
    }
  };

  if (loading) {
    return (
      <div
        className={cx(containerStyles.preview, containerStyles.previewWide)}
        style={{ padding: 12 }}
      >
        <div className={localStyles.loadingState}>
          <Spinner style={{ height: 24, width: 24 }} />
          <div className={localStyles.loadingText}>{t('shareModal.generatingPdf')}</div>
        </div>
      </div>
    );
  }

  if (!pdfData) {
    return (
      <div
        className={cx(containerStyles.preview, containerStyles.previewWide)}
        style={{ padding: 12 }}
      >
        <div className={localStyles.emptyState}>
          <Button size="lg" variant="default" onClick={onGeneratePdf}>
            <FileText size={20} />
            {t('shareModal.generatePdf')}
          </Button>
        </div>
      </div>
    );
  }

  const pdfDataUri = `data:application/pdf;base64,${pdfData}`;

  const handleFullscreen = () => {
    if (pdfData) openPdfFullscreenModal(pdfDataUri, pageNumber);
  };

  return (
    <div className={localStyles.containerWrapper}>
      {pdfData && (
        <Button
          className={cn(localStyles.expandButton)}
          size="icon-sm"
          variant="ghost"
          onClick={handleFullscreen}
        >
          <Expand size={16} />
        </Button>
      )}

      <div
        className={cx(
          containerStyles.preview,
          containerStyles.previewWide,
          localStyles.previewContainer,
        )}
      >
        <Document
          file={pdfDataUri}
          loading={
            <div className={localStyles.documentLoading}>
              <Spinner />
              <div className={localStyles.loadingText}>{t('shareModal.loadingPdf')}</div>
            </div>
          }
          onLoadSuccess={onDocumentLoadSuccess}
        >
          <Page
            pageNumber={pageNumber}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            width={isMobile ? 300 : 400}
          />
        </Document>
      </div>

      {pdfData && numPages > 1 && (
        <div className={localStyles.footerNavigation}>
          <div className="flex flex-row items-center gap-2 justify-center">
            <Button
              disabled={pageNumber <= 1}
              size="icon-sm"
              variant="ghost"
              onClick={goToPrevPage}
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex flex-row items-center gap-1">
              <Input
                className={localStyles.pageInput}
                max={numPages}
                min={1}
                type="number"
                value={pageNumber}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) goToPage(value);
                }}
              />
              <span className={localStyles.pageNumberText}>/ {numPages}</span>
            </div>
            <Button
              disabled={pageNumber >= numPages}
              size="icon-sm"
              variant="ghost"
              onClick={goToNextPage}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

export default PdfPreview;
