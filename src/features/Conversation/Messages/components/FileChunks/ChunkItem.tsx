import { type ChatFileChunk } from '@orvilo/types';
import { cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import FileIcon from '@/components/FileIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsDark } from '@/hooks/useIsDark';
import { useChatStore } from '@/store/chat';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { styles } from './style';

export interface ChunkItemProps extends ChatFileChunk {
  index: number;
}

const ChunkItem = memo<ChunkItemProps>(({ id, fileId, similarity, text, filename, fileType }) => {
  const isDarkMode = useIsDark();
  // Note: openFilePreview is a portal action, kept in ChatStore as it's a global UI state
  const openFilePreview = useChatStore((s) => s.openFilePreview);

  return (
    <div
      {...clickableProps()}
      key={id}
      className={cn(
        cn(
          'flex items-center gap-1',
          cx(styles.container, isDarkMode ? styles.containerDark : styles.containerLight),
        ),
        CLICKABLE_FOCUS_RING,
      )}
      onClick={(e) => {
        e.stopPropagation();
        openFilePreview({ chunkId: id, chunkText: text, fileId });
      }}
    >
      <FileIcon fileName={filename} fileType={fileType} size={20} variant={'raw'} />
      <div className="flex gap-3 justify-between" style={{ maxWidth: 200 }}>
        <div className="truncate">{filename}</div>
        {similarity && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span style={{ display: 'inline-flex' }}>
                    <div className={cn('flex flex-col items-center justify-center', styles.badge)}>
                      {similarity.toFixed(1)}
                    </div>
                  </span>
                }
              />
              <TooltipContent>{similarity}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
});

export default ChunkItem;
