'use client';

import { cn } from 'cn';
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

const styles = {
  containerWrapper: 'relative w-full h-full',
  documentLoading: 'flex flex-col items-center justify-center h-full p-4',
  emptyState: 'flex items-center justify-center h-full text-muted-foreground',
  expandButton: 'absolute z-1000 inset-bs-5 inset-e-5',
  footerNavigation:
    'absolute z-10 inset-be-0 inset-x-0 p-4 border-bs border-divider bg-card/90 backdrop-blur-sm',
  fullscreenButton: 'border-border text-popover-foreground',
  fullscreenContent: 'flex items-start justify-center min-h-full p-4',
  fullscreenModal: 'relative overflow-auto h-[90vh]',
  fullscreenNavigation:
    'fixed z-1001 inset-be-5 inset-x-0 mx-auto w-max p-4 rounded-(--radius-overlay) bg-popover/70 backdrop-blur-sm',
  fullscreenPageInput: 'w-15 text-center',
  fullscreenPageText: 'min-w-5 text-xs leading-5 text-popover-foreground',
  loadingState: 'flex flex-col items-center justify-center h-full',
  loadingText: 'mbs-2 text-sm leading-5.5 text-muted-foreground',
  pageInput: 'w-12.5 text-center',
  pageNumberText: 'text-xs leading-5 text-muted-foreground',
  previewContainer: 'flex items-start justify-center h-full p-4',
};

interface FullscreenContentProps {
  initialPage: number;
  pdfDataUri: string;
}

const FullscreenContent = memo<FullscreenContentProps>(({ pdfDataUri, initialPage }) => {
  const { t: tCommon } = useTranslation('common');
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
      <div className={cn(styles.fullscreenContent, numPages > 1 && 'pbe-25')}>
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
              aria-label={tCommon('previous')}
              className={cn(styles.fullscreenButton)}
              disabled={pageNumber <= 1}
              size="icon"
              variant="ghost"
              onClick={goToPrev}
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex flex-row items-center gap-2">
              <Input
                aria-label={tCommon('cmdk.search.page')}
                className={styles.fullscreenPageInput}
                max={numPages}
                min={1}
                type="number"
                value={pageNumber}
                visualSize="compact"
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) goToPage(value);
                }}
              />
              <span className={styles.fullscreenPageText}>/ {numPages}</span>
            </div>
            <Button
              aria-label={tCommon('next')}
              className={cn(styles.fullscreenButton)}
              disabled={pageNumber >= numPages}
              size="icon"
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
      <div className={cn(containerStyles.preview, containerStyles.previewWide, 'p-4')}>
        <div className={localStyles.loadingState}>
          <Spinner />
          <div className={localStyles.loadingText}>{t('shareModal.generatingPdf')}</div>
        </div>
      </div>
    );
  }

  if (!pdfData) {
    return (
      <div className={cn(containerStyles.preview, containerStyles.previewWide, 'p-4')}>
        <div className={localStyles.emptyState}>
          <Button size="lg" variant="default" onClick={onGeneratePdf}>
            <FileText className="size-4" />
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
          aria-label={t('fullscreen', { ns: 'common' })}
          className={cn(localStyles.expandButton)}
          size="icon"
          variant="ghost"
          onClick={handleFullscreen}
        >
          <Expand size={16} />
        </Button>
      )}

      <div
        className={cn(
          containerStyles.preview,
          containerStyles.previewWide,
          localStyles.previewContainer,
          numPages > 1 && 'pbe-[calc(var(--spacing)*20_+_1px)]',
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
              aria-label={t('previous', { ns: 'common' })}
              disabled={pageNumber <= 1}
              size="icon"
              variant="ghost"
              onClick={goToPrevPage}
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex flex-row items-center gap-1">
              <Input
                aria-label={t('cmdk.search.page', { ns: 'common' })}
                className={localStyles.pageInput}
                max={numPages}
                min={1}
                type="number"
                value={pageNumber}
                visualSize="compact"
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) goToPage(value);
                }}
              />
              <span className={localStyles.pageNumberText}>/ {numPages}</span>
            </div>
            <Button
              aria-label={t('next', { ns: 'common' })}
              disabled={pageNumber >= numPages}
              size="icon"
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
