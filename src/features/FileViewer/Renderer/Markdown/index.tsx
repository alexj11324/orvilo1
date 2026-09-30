'use client';

import { Markdown } from '@lobehub/ui';
import { Tabs } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CodeIcon, EyeIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { CodeBlock } from '@/components/reui/code-block/code-block';

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
      <div className="flex flex-col items-center justify-center h-[100%] w-[100%]">
        <NeuralNetworkLoading size={36} />
      </div>
    );

  return (
    <div className={cx('flex flex-col', styles.page)}>
      <div className={cx('flex flex-row items-center gap-1', styles.controls)}>
        <Tabs
          activeKey={mode}
          size={'small'}
          items={[
            {
              icon: (
                <span className="anticon" role="img">
                  <EyeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                </span>
              ),
              key: 'render',
              label: t('preview.render'),
            },
            {
              icon: (
                <span className="anticon" role="img">
                  <CodeIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
                </span>
              ),
              key: 'raw',
              label: t('preview.raw'),
            },
          ]}
          onChange={(key) => setMode(key as PreviewMode)}
        />
      </div>
      {mode === 'render' ? (
        <Markdown style={{ paddingBlock: 16, paddingInline: 24 }}>{fileData}</Markdown>
      ) : (
        <CodeBlock className="h-full" code={fileData} language={'markdown'} variant={'ghost'} />
      )}
    </div>
  );
});

export default MarkdownViewer;
