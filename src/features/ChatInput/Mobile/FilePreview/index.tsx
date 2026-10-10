import { PreviewGroup } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatInputStore } from '@/features/ChatInput/store';
import { filesSelectors, useFileStore } from '@/store/file';

import FileItem from './FileItem';

const styles = {
  container: 'overflow-x-scroll w-full',
};

const FilePreview = memo(() => {
  const expand = useChatInputStore((s) => s.expand);
  const list = useFileStore(filesSelectors.chatUploadFileList, isEqual);
  if (!list || list?.length === 0) return null;

  return (
    <ScrollArea className={`${styles.container} [&_[data-slot=scroll-area-scrollbar]]:hidden`}>
      <div className="flex flex-row gap-1.5 py-2" style={{ paddingInline: expand ? 0 : 12 }}>
        <PreviewGroup>
          {list.map((i) => (
            <FileItem {...i} key={i.id} loading={i.status === 'pending'} />
          ))}
        </PreviewGroup>
      </div>
    </ScrollArea>
  );
});

export default FilePreview;
