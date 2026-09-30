import { Skeleton } from '@lobehub/ui/base-ui';
import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import type { ChatMessagePluginError } from '@orvilo/types';
import { FolderOpenIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';

import FileItem from '../../components/FileItem';

interface SearchFilesProps {
  listResults?: Array<{ isDirectory: boolean; name: string; path?: string; size?: number }>;
  messageId: string;
  pluginError: ChatMessagePluginError;
}

const SearchFiles = memo<SearchFilesProps>(({ listResults = [], messageId }) => {
  const { isLoading } = useToolRenderCapabilities();
  const { t } = useTranslation('tool');
  const loading = isLoading?.(messageId);

  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} />
      </div>
    );
  }

  if (listResults.length === 0) {
    return (
      <div className="rounded-md border bg-card">
        <SimpleEmpty description={t('localFiles.listFiles.emptyDirectory')} icon={FolderOpenIcon} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5" style={{ maxHeight: 140, overflow: 'scroll' }}>
      {listResults.map((item) => (
        <FileItem key={item.path || item.name} {...item} showTime />
      ))}
    </div>
  );
});

SearchFiles.displayName = 'SearchFiles';

export default SearchFiles;
