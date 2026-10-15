'use client';

import { cn } from 'cn';
import { CodeIcon, EyeIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Markdown } from '@/components/Markdown';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useTextFileLoader } from '../../hooks/useTextFileLoader';

const styles = {
  controls:
    'absolute z-2 inset-bs-2 inset-e-3 p-1 border border-divider rounded-(--radius-overlay) opacity-55 bg-popover backdrop-blur-[8px] shadow-(--shadow-raised) transition-opacity duration-(--orvilo-motion-mid) ease-[ease] hover:opacity-100 focus-within:opacity-100',
  page: 'relative [overflow:hidden_auto] w-full h-full',
};

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
      <div className="flex items-center justify-center h-full w-full">
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
          <TabsList className="rounded-(--radius-button)">
            <TabsTrigger className="rounded-(--radius-input)" value="render">
              <EyeIcon />
              {t('preview.render')}
            </TabsTrigger>
            <TabsTrigger className="rounded-(--radius-input)" value="raw">
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
