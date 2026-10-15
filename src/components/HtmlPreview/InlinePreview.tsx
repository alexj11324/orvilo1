import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview';
import { CodeBlock } from '@/components/ui/code-block';

import { applyHtmlPreviewBaseUrl } from './applyBaseUrl';
import {
  buildHtmlPreviewSrcDoc,
  containsScript,
  HTML_PREVIEW_MAX_LENGTH,
  HTML_PREVIEW_SANDBOX,
  isHtmlContentClosed,
} from './srcDoc';

export interface HtmlPreviewOptions {
  /** Fires when a host offers an expand affordance for the preview. */
  onExpand?: (content: string) => void;
  /** Overrides the iframe sandbox. Strongly discouraged; see `HTML_PREVIEW_SANDBOX`. */
  sandbox?: string;
  /**
   * While streaming: `defer` keeps the source visible until the document
   * closes, `live` updates the frame per chunk, and `auto` defers only when
   * the content contains scripts (so `setup()`-style demos run once).
   */
  streamingMode?: 'auto' | 'defer' | 'live';
}

interface InlineHtmlPreviewProps {
  animated?: boolean;
  baseUrl?: string;
  className?: string;
  content: string;
  height?: CSSProperties['height'];
  previewProps?: HtmlPreviewOptions;
  style?: CSSProperties;
  width?: CSSProperties['width'];
}

const InlineHtmlPreview = memo<InlineHtmlPreviewProps>(
  ({
    animated,
    baseUrl,
    className,
    content,
    previewProps,
    height = '100%',
    style,
    width = '100%',
  }) => {
    const { t } = useTranslation('components');
    const previewContent = useMemo(
      () => applyHtmlPreviewBaseUrl(content, baseUrl),
      [baseUrl, content],
    );
    const streamingMode = previewProps?.streamingMode ?? 'auto';
    const deferred =
      !!animated &&
      !isHtmlContentClosed(previewContent) &&
      (streamingMode === 'defer' || (streamingMode === 'auto' && containsScript(previewContent)));
    const sourceOnly = deferred || previewContent.length > HTML_PREVIEW_MAX_LENGTH;
    const srcDoc = useMemo(
      () => (sourceOnly ? '' : buildHtmlPreviewSrcDoc(previewContent)),
      [previewContent, sourceOnly],
    );

    return (
      <WebPreview className="min-h-0 border-0 rounded-none" style={{ height, width, ...style }}>
        {sourceOnly ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <CodeBlock code={previewContent} language="html" streaming={animated} variant="ghost" />
          </div>
        ) : (
          <WebPreviewBody
            className={className}
            sandbox={previewProps?.sandbox ?? HTML_PREVIEW_SANDBOX}
            srcDoc={srcDoc}
            style={{ border: 0, height, minHeight: 0, width }}
            title={t('HtmlPreview.iframeTitle')}
          />
        )}
      </WebPreview>
    );
  },
);

InlineHtmlPreview.displayName = 'InlineHtmlPreview';

export default InlineHtmlPreview;
