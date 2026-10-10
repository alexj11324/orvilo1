'use client';

import { memo } from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';
import { getLanguageFromFilename } from '@/utils/fileLanguage';

import { useTextFileLoader } from '../../hooks/useTextFileLoader';

interface CodeViewerProps {
  fileId: string;
  fileName?: string;
  url: string | null;
}

const CodeViewer = memo<CodeViewerProps>(({ url, fileName }) => {
  const { fileData, loading } = useTextFileLoader(url);
  const language = getLanguageFromFilename(fileName);

  return (
    <div className={'flex flex-col w-full h-full ps-6 pe-1'}>
      {!loading && fileData ? (
        <CodeBlock className="h-full" code={fileData} language={language} variant={'ghost'}>
          <CodeBlockCopyButton />
        </CodeBlock>
      ) : (
        <div className="flex flex-col items-center justify-center h-full">
          <NeuralNetworkLoading size={36} />
        </div>
      )}
    </div>
  );
});

export default CodeViewer;
