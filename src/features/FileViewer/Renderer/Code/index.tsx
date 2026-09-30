'use client';

import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { CodeBlock } from '@/components/reui/code-block/code-block';
import { getLanguageFromFilename } from '@/utils/fileLanguage';

import { useTextFileLoader } from '../../hooks/useTextFileLoader';

const styles = createStaticStyles(({ css }) => ({
  page: css`
    width: 100%;
    height: 100%;
    padding-inline: 24px 4px;
  `,
}));

interface CodeViewerProps {
  fileId: string;
  fileName?: string;
  url: string | null;
}

const CodeViewer = memo<CodeViewerProps>(({ url, fileName }) => {
  const { fileData, loading } = useTextFileLoader(url);
  const language = getLanguageFromFilename(fileName);

  return (
    <div className={cx('flex flex-col', styles.page)}>
      {!loading && fileData ? (
        <CodeBlock className="h-full" code={fileData} language={language} variant={'ghost'} />
      ) : (
        <div className="flex flex-col items-center justify-center h-[100%]">
          <NeuralNetworkLoading size={36} />
        </div>
      )}
    </div>
  );
});

export default CodeViewer;
