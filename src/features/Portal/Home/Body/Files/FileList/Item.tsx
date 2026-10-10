import { type ChatFileItem } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import FileIcon from '@/components/FileIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chat';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { formatSize } from '@/utils/format';

const styles = {
  container:
    'cursor-pointer overflow-hidden max-w-105 py-2 px-3 rounded-(--radius-card) bg-muted hover:bg-selected',
};

const FileItem = memo<ChatFileItem>(({ name, fileType, size, id }) => {
  const openFilePreview = useChatStore((s) => s.openFilePreview);

  return (
    <div
      {...clickableProps()}
      className={cn('flex flex-row items-center gap-2', styles.container, CLICKABLE_FOCUS_RING)}
      onClick={() => {
        openFilePreview({ fileId: id });
      }}
    >
      <FileIcon fileName={name} fileType={fileType} />
      <div className="flex flex-col">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<div className="truncate min-w-0" />}>{name}</TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="text-muted-foreground">{formatSize(size)}</div>
      </div>
    </div>
  );
});

export default FileItem;
