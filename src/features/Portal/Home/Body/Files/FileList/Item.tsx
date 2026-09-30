import { type ChatFileItem } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';

import FileIcon from '@/components/FileIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chat';
import { formatSize } from '@/utils/format';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    cursor: pointer;

    overflow: hidden;

    max-width: 420px;
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 8px;

    background: ${cssVar.colorFillTertiary};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
}));

const FileItem = memo<ChatFileItem>(({ name, fileType, size, id }) => {
  const openFilePreview = useChatStore((s) => s.openFilePreview);

  return (
    <div
      className={cx('flex flex-row items-center gap-2', styles.container)}
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
