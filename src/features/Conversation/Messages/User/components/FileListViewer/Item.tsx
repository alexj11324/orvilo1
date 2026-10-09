import { cn } from 'cn';
import { FileLock2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
} from '@/components/ai-elements/attachments';
import FileIcon from '@/components/FileIcon';
import { useChatStore } from '@/store/chat';
import { type ChatFileItem } from '@/types/index';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { formatSize } from '@/utils/format';

/**
 * Tombstone card for a file the viewer lost access to (its owner switched it
 * back to private, or it was deleted). The server strips name/size/url, so
 * there is nothing to preview — render a static no-access placeholder.
 */
const InaccessibleFileItem = memo(() => {
  const { t } = useTranslation('chat');

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <FileLock2Icon size={32} style={{ opacity: 0.45 }} />
      <div className="flex flex-col" style={{ overflow: 'hidden' }}>
        <div className="truncate text-muted-foreground">{t('inaccessibleFile.name')}</div>
        <div className="text-[12px] text-muted-foreground">{t('inaccessibleFile.desc')}</div>
      </div>
    </div>
  );
});

const FileItem = memo<ChatFileItem>(({ id, fileType, size, name, inaccessible }) => {
  const openFilePreview = useChatStore((s) => s.openFilePreview);

  if (inaccessible) return <InaccessibleFileItem />;

  return (
    <Attachment
      {...clickableProps()}
      className={cn('cursor-pointer', CLICKABLE_FOCUS_RING)}
      data={{ type: 'file', id, filename: name, mediaType: fileType, url: '' }}
      onClick={() => openFilePreview({ fileId: id })}
    >
      <AttachmentPreview
        fallbackIcon={<FileIcon fileName={name} fileType={fileType} size={28} />}
      />
      <div className="min-w-0 flex-1">
        <AttachmentInfo />
        <div className="text-xs text-muted-foreground">{formatSize(size)}</div>
      </div>
    </Attachment>
  );
});
export default FileItem;
