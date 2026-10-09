'use client';

import type { HtmlPreview } from '@lobehub/ui';
import { extractHtmlTitle } from '@orvilo/html-artifact';
import { exportFile } from '@orvilo/utils/client';
import { Code2, Download, Eye, Maximize2, RotateCw } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
} from '@/components/ai-elements/web-preview';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';

import InlineHtmlPreview from './InlinePreview';
import HtmlPreviewDrawer from './PreviewDrawer';

interface ChatHtmlPreviewProps {
  animated?: boolean;
  content: string;
  previewProps?: Omit<ComponentProps<typeof HtmlPreview>, 'children'>;
}

/** Official WebPreview chrome around the existing isolated streaming HTML engine. */
export function ChatHtmlPreview({ animated, content, previewProps }: ChatHtmlPreviewProps) {
  const { t } = useTranslation('components');
  const [source, setSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const title = extractHtmlTitle(content) || t('HtmlPreview.title');

  return (
    <>
      <WebPreview className="my-3 h-[400px] min-w-0 overflow-hidden" data-ai-element="web-preview">
        <WebPreviewNavigation>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{title}</span>
          <WebPreviewNavigationButton
            aria-label={t(source ? 'HtmlPreview.mode.preview' : 'HtmlPreview.mode.code')}
            tooltip={t(source ? 'HtmlPreview.mode.preview' : 'HtmlPreview.mode.code')}
            onClick={() => setSource(!source)}
          >
            {source ? <Eye className="size-4" /> : <Code2 className="size-4" />}
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton
            aria-label={t('refresh', { ns: 'common' })}
            disabled={source}
            tooltip={t('refresh', { ns: 'common' })}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCw className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton
            aria-label={t('HtmlPreview.actions.download')}
            tooltip={t('HtmlPreview.actions.download')}
            onClick={() => exportFile(content, 'preview.html')}
          >
            <Download className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton
            aria-label={t('fullscreen', { ns: 'common' })}
            tooltip={t('fullscreen', { ns: 'common' })}
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="size-4" />
          </WebPreviewNavigationButton>
        </WebPreviewNavigation>
        {source ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <CodeBlock code={content} language="html">
              <CodeBlockCopyButton />
            </CodeBlock>
          </div>
        ) : (
          <InlineHtmlPreview
            animated={animated}
            content={content}
            height="100%"
            key={revision}
            previewProps={previewProps}
          />
        )}
      </WebPreview>
      {expanded && <HtmlPreviewDrawer open content={content} onClose={() => setExpanded(false)} />}
    </>
  );
}
