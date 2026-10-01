import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import type { ChatMessagePluginError } from '@orvilo/types';
import { SearchIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';
import { Skeleton } from '@/components/ui/skeleton';

import FileItem from '../../components/FileItem';

interface SearchFilesProps {
  messageId: string;
  pluginError: ChatMessagePluginError;
  searchResults?: Array<{ isDirectory?: boolean; name?: string; path: string; size?: number }>;
}

const SearchFiles = memo<SearchFilesProps>(({ searchResults = [], messageId }) => {
  const { isLoading } = useToolRenderCapabilities();
  const { t } = useTranslation('tool');
  const loading = isLoading?.(messageId);

  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton style={{ height: 16 }} />
        <Skeleton style={{ height: 16 }} />
        <Skeleton style={{ height: 16 }} />
        <Skeleton style={{ height: 16 }} />
      </div>
    );
  }

  if (searchResults.length === 0) {
    return (
      <div className="rounded-md border bg-card">
        <SimpleEmpty description={t('search.emptyResult')} icon={SearchIcon} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5" style={{ maxHeight: 220, overflow: 'auto' }}>
      {searchResults.map((item) => (
        <FileItem key={item.path} {...item} />
      ))}
    </div>
  );
});

SearchFiles.displayName = 'SearchFiles';

export default SearchFiles;
