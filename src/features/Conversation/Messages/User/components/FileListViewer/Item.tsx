import { FileLock2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { useChatStore } from '@/store/chat';
import { type ChatFileItem } from '@/types/index';
import { formatSize } from '@/utils/format';

/**
 * Tombstone card for a file the viewer lost access to (its owner switched it
 * back to private, or it was deleted). The server strips name/size/url, so
 * there is nothing to preview — render a static no-access placeholder.
 */
const InaccessibleFileItem = memo(() => {
  const { t } = useTranslation('chat');

  return (
    <div
      className="flex items-center gap-3 py-2"
      style={{
        paddingInline: '12px 16px',
        border: `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,
      }}
    >
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
    <div
      className="flex items-center gap-3 py-2"
      key={id}
      style={{
        cursor: 'pointer',
        paddingInline: '12px 16px',
        border: `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,
      }}
      onClick={() => {
        openFilePreview({ fileId: id });
      }}
    >
      <FileIcon fileName={name} fileType={fileType} size={32} />
      <div className="flex flex-col" style={{ overflow: 'hidden' }}>
        <div className="truncate">{name}</div>
        <div className="text-[12px] text-muted-foreground">{formatSize(size)}</div>
      </div>
    </div>
  );
});
export default FileItem;
