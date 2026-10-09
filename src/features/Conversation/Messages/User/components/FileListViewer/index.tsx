import { memo } from 'react';

import { Attachments } from '@/components/ai-elements/attachments';
import { type ChatFileItem } from '@/types/index';

import FileItem from './Item';

interface FileListViewerProps {
  items: ChatFileItem[];
}

const FileListViewer = memo<FileListViewerProps>(({ items }) => {
  return (
    <Attachments className="w-full" variant="list">
      {items.map((item) => (
        <FileItem key={item.id} {...item} />
      ))}
    </Attachments>
  );
});
export default FileListViewer;
