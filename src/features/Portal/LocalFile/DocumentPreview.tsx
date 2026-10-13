'use client';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { clsx } from 'cn';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import Loading from '@/components/Loading/CircleLoading';
import { Button } from '@/components/ui/button';
import { Document, Page, pdfjs } from '@/libs/pdfjs';
import { localFileService } from '@/services/electron/localFileService';

import XlsxPane from './xlsx/XlsxPane';

// Same CDN assets as the FileViewer PDF renderer — cmaps / fonts are required
// for non-latin PDFs.
const pdfOptions = {
  cMapUrl: `https://registry.npmmirror.com/pdfjs-dist/${pdfjs.version}/files/cmaps/`,
  standardFontDataUrl: `https://registry.npmmirror.com/pdfjs-dist/${pdfjs.version}/files/standard_fonts/`,
};

const maxPageWidth = 1200;

const flatStyles = {
  docxContainer: 'overflow-auto h-full bg-background',
  page: 'overflow-hidden mbe-3 rounded-(--radius-card) shadow-(--shadow-raised)',
  fallbackIcon: 'size-16 rounded-(--radius-card) bg-muted',
  officeContainer: 'overflow-auto h-full bg-background',
  pdfContainer: 'overflow-auto flex flex-col items-center h-full py-4 bg-background',
};

const PdfPane = memo<{ blob: Blob }>(({ blob }) => {
  const [numPages, setNumPages] = useState(0);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();

  useEffect(() => {
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const width = containerWidth ? Math.min(containerWidth - 32, maxPageWidth) : undefined;

  return (
    <div className={flatStyles.pdfContainer} ref={setContainer}>
      <Document
        file={blob}
        loading={<Loading />}
        options={pdfOptions}
        onLoadSuccess={(document) => setNumPages(document.numPages)}
      >
        {Array.from({ length: numPages }, (_, index) => (
          <Page
            className={flatStyles.page}
            key={`page_${index + 1}`}
            pageNumber={index + 1}
            width={width}
          />
        ))}
      </Document>
    </div>
  );
});

PdfPane.displayName = 'PdfPane';

interface OfficePaneProps {
  blob: Blob;
  /** Renderer failed — parent swaps in the download / open-externally state. */
  onError: (error: unknown) => void;
}

const PptxPane = memo<OfficePaneProps>(({ blob, onError }) => {
  const [loading, setLoading] = useState(true);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!container || !scrollEl) return;

    const controller = new AbortController();
    let viewer: { destroy: () => void } | undefined;

    (async () => {
      try {
        const { PptxViewer, RECOMMENDED_ZIP_LIMITS } = await import('@aiden0z/pptx-renderer');
        if (controller.signal.aborted) return;
        viewer = await PptxViewer.open(blob, container, {
          listOptions: { windowed: true },
          scrollContainer: scrollEl,
          signal: controller.signal,
          // Local files are still untrusted input (agent/tool generated) — cap
          // the ZIP expansion to keep a hostile pptx from exhausting memory.
          zipLimits: RECOMMENDED_ZIP_LIMITS,
        });
        setLoading(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        onError(error);
      }
    })();

    return () => {
      controller.abort();
      viewer?.destroy();
    };
  }, [blob, container, scrollEl, onError]);

  return (
    <div className={flatStyles.officeContainer} ref={setScrollEl}>
      {loading && <Loading />}
      {/* The viewer owns this node's children — React must never render into it,
          or its bookkeeping breaks when the library replaces the content. */}
      <div ref={setContainer} />
    </div>
  );
});

PptxPane.displayName = 'PptxPane';

const DocxPane = memo<OfficePaneProps>(({ blob, onError }) => {
  const [loading, setLoading] = useState(true);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!container) return;

    let disposed = false;

    (async () => {
      try {
        const { defaultOptions, renderAsync } = await import('docx-preview');
        if (disposed) return;
        await renderAsync(blob, container, undefined, {
          // Keep the renderer's wrapper and numbering scope. Its unlayered
          // defaults require the public native renderer styling interface.
          h: (element) => {
            const node = defaultOptions.h(element);
            if (
              typeof element !== 'string' &&
              !(element instanceof Node) &&
              node instanceof HTMLElement
            ) {
              let frameStyle: string | undefined;
              if (element.tagName === 'div' && element.className === 'docx-wrapper') {
                frameStyle =
                  'display:flex;flex-direction:column;gap:12px;align-items:safe center;padding:calc(var(--spacing) * 4);background:transparent;';
              } else if (element.tagName === 'section' && element.className === 'docx') {
                frameStyle =
                  'margin-block-end:0;border-radius:var(--radius-card);box-shadow:var(--shadow-raised);';
              }
              if (frameStyle) {
                // The file's own style comes last, retaining its dimensions,
                // margins, fonts, colors and all native renderer properties.
                node.style.cssText = frameStyle + node.style.cssText;
              }
            }
            return node;
          },
        });
        if (!disposed) setLoading(false);
      } catch (error) {
        if (!disposed) onError(error);
      }
    })();

    return () => {
      disposed = true;
      // renderAsync has no dispose handle — it owns the container's children
      // (including injected <style>), so clearing it is the documented cleanup.
      container.replaceChildren();
    };
  }, [blob, container, onError]);

  return (
    <div className={flatStyles.docxContainer}>
      {loading && <Loading />}
      <div ref={setContainer} />
    </div>
  );
});

DocxPane.displayName = 'DocxPane';

/**
 * Modern OOXML formats with an in-app renderer. Legacy binary formats (.doc /
 * .ppt / .xls) have none and keep the download / open-externally fallback.
 */
const OFFICE_PANES: Record<string, typeof PptxPane> = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': PptxPane,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': XlsxPane,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': DocxPane,
};

export interface DocumentPreviewProps {
  blob: Blob;
  contentType: string;
  filePath: string;
  /** File lives on this desktop's filesystem — offer "open with default app". */
  isLocalFile: boolean;
}

/**
 * In-portal preview for binary documents transported as blobs. PDFs render
 * inline via react-pdf (the Electron iframe PDF plugin is disabled, so a blob
 * URL in an iframe would not render on desktop); pptx / docx / xlsx render
 * inline via dynamically-imported client renderers, falling back to a
 * download / open-externally state when parsing fails. Legacy binary office
 * formats (.doc / .ppt / .xls) have no local renderer and always degrade.
 */
const DocumentPreview = memo<DocumentPreviewProps>(
  ({ blob, contentType, filePath, isLocalFile }) => {
    const { t } = useTranslation('chat');
    const filename = filePath.split('/').at(-1) ?? '';
    const [renderError, setRenderError] = useState(false);

    useEffect(() => {
      setRenderError(false);
    }, [blob, contentType]);

    const handleRenderError = useCallback((error: unknown) => {
      console.error('[DocumentPreview] office render failed:', error);
      setRenderError(true);
    }, []);

    const handleDownload = useCallback(() => {
      const url = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      // Chromium resolves the blob URL synchronously on click, but defer the
      // revoke so slower engines can still start the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, [blob, filename]);

    if (contentType === 'application/pdf') return <PdfPane blob={blob} />;

    const OfficePane = OFFICE_PANES[contentType];
    if (OfficePane && !renderError) {
      return <OfficePane blob={blob} onError={handleRenderError} />;
    }

    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full w-full p-4 text-sm leading-5.5 text-foreground">
        <div className={clsx('flex flex-col items-center justify-center', flatStyles.fallbackIcon)}>
          <FileIcon fileName={filename} size={40} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="font-medium">{filename}</div>
          <div className="text-muted-foreground">
            {t('workingPanel.localFile.document.unsupported')}
          </div>
        </div>
        {isLocalFile ? (
          <Button
            size="lg"
            variant="outline"
            onClick={() => localFileService.openLocalFile({ path: filePath })}
          >
            {t('workingPanel.localFile.document.openWithDefaultApp')}
          </Button>
        ) : (
          <Button size="lg" variant="outline" onClick={handleDownload}>
            {t('workingPanel.localFile.document.download')}
          </Button>
        )}
      </div>
    );
  },
);

DocumentPreview.displayName = 'DocumentPreview';

export default DocumentPreview;
