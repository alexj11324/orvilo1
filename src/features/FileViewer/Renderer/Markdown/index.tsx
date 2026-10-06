'use client';

import { Markdown } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { CodeIcon, EyeIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useTextFileLoader } from '../../hooks/useTextFileLoader';

const styles = createStaticStyles(({ css }) => ({
  // Same floating-controls treatment as the LocalFile portal's text preview, so
  // the render/raw toggle reads identically across both file-preview surfaces.
  controls: css`
    position: absolute;
    z-index: 2;
    inset-block-start: 8px;
    inset-inline-end: 12px;

    padding: 4px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    opacity: 0.55;
    background: ${cssVar.colorBgElevated};
    backdrop-filter: blur(8px);
    box-shadow: ${cssVar.boxShadowTertiary};

    transition: opacity 150ms ease;

    &:hover {
      opacity: 1;
    }
  `,
  page: css`
    position: relative;
    overflow: hidden auto;
    width: 100%;
    height: 100%;
  `,
}));

type PreviewMode = 'render' | 'raw';

interface MarkdownViewerProps {
  fileId: string;
  url: string | null;
}

/**
 * Rendered markdown preview for cloud files (with a raw-source toggle) — the
 * FilePreview counterpart of the LocalFile portal's markdown pane. Plain code
 * files keep going through `Renderer/Code`.
 */
const MarkdownViewer = memo<MarkdownViewerProps>(({ url }) => {
  const { t } = useTranslation('file');
  const { fileData, loading } = useTextFileLoader(url);
  const [mode, setMode] = useState<PreviewMode>('render');

  if (loading || fileData === null)
    return (
      <div className="flex items-center justify-center" style={{ height: '100%', width: '100%' }}>
        <NeuralNetworkLoading size={36} />
      </div>
    );

  return (
    <div className={cn('flex flex-col', styles.page)}>
      <div className={cn('flex items-center gap-1', styles.controls)}>
        <Tabs
          value={mode}
          onValueChange={(key) => {
            if (typeof key === 'string') setMode(key as PreviewMode);
          }}
        >
          <TabsList>
            <TabsTrigger value="render">
              <EyeIcon />
              {t('preview.render')}
            </TabsTrigger>
            <TabsTrigger value="raw">
              <CodeIcon />
              {t('preview.raw')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {mode === 'render' ? (
        <Markdown style={{ paddingBlock: 16, paddingInline: 24 }}>{fileData}</Markdown>
      ) : (
        <CodeBlock code={fileData} language={'markdown'} variant={'ghost'}>
          <CodeBlockCopyButton />
        </CodeBlock>
      )}
    </div>
  );
});

export default MarkdownViewer;
