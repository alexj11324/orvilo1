'use client';

import { memo } from 'react';

import FileViewer from '@/features/FileViewer';
import { fileManagerSelectors, useFileStore } from '@/store/file';

interface FilePreviewerProps {
  fileId?: string;
}

const FilePreviewer = memo<FilePreviewerProps>(({ fileId }) => {
  const useFetchKnowledgeItem = useFileStore((s) => s.useFetchKnowledgeItem);
  const { data: fetchedFile } = useFetchKnowledgeItem(fileId);
  const file = useFileStore(fileManagerSelectors.getFileById(fileId));

  const displayFile = file || fetchedFile;

  if (!fileId || !displayFile) return null;

  return (
    <div className="flex flex-col h-[100%] w-[100%]">
      <div className="flex flex-col flex-1 h-[100%]" style={{ overflow: 'auto' }}>
        <FileViewer {...displayFile} />
      </div>
    </div>
  );
});

FilePreviewer.displayName = 'FilePreviewer';

export default FilePreviewer;
