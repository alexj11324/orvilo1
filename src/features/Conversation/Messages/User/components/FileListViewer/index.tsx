import { memo } from 'react';

import { type ChatFileItem } from '@/types/index';

import FileItem from './Item';

interface FileListViewerProps {
  items: ChatFileItem[];
}

const FileListViewer = memo<FileListViewerProps>(({ items }) => {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <FileItem key={item.id} {...item} />
      ))}
    </div>
  );
});
export default FileListViewer;
