import { type ChatFileChunk } from '@orvilo/types';
import { clsx as cx, cn } from 'cn';
import { BookOpenTextIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsDark } from '@/hooks/useIsDark';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import ChunkItem from './ChunkItem';

const styles = {
  container: 'cursor-pointer py-2 px-3 pe-3 rounded-(--radius-card) text-foreground bg-muted',
  containerDark: '',
  containerLight: 'hover:bg-selected',
  title: 'line-clamp-1 text-xs text-ellipsis',
};

interface FileChunksProps {
  data: ChatFileChunk[];
}

const FileChunks = memo<FileChunksProps>(({ data }) => {
  const { t } = useTranslation('chat');
  const isDarkMode = useIsDark();

  const [showDetail, setShowDetail] = useState(false);

  return (
    <div
      {...clickableProps()}
      className={cn(
        cn(
          'flex flex-col gap-4 w-full',
          cx(styles.container, isDarkMode ? styles.containerDark : styles.containerLight),
        ),
        CLICKABLE_FOCUS_RING,
      )}
      onClick={() => {
        setShowDetail(!showDetail);
      }}
    >
      <div className="flex justify-between flex-1">
        <div className="flex gap-2">
          <BookOpenTextIcon className="size-4 text-foreground-tertiary" size={16} />{' '}
          {t('rag.referenceChunks')}
        </div>
        {createElement(showDetail ? ChevronDown : ChevronRight, { className: 'size-4', size: 16 })}
      </div>
      {showDetail && (
        <div className="flex gap-2 flex-wrap">
          {data.map((item, index) => {
            return <ChunkItem index={index} key={item.id} {...item} />;
          })}
        </div>
      )}
    </div>
  );
});

export default FileChunks;
