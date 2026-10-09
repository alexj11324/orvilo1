import { type ChatFileChunk } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { BookOpenTextIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsDark } from '@/hooks/useIsDark';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import ChunkItem from './ChunkItem';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    cursor: pointer;

    padding-block: 8px;
    padding-inline: 12px;
    padding-inline-end: 12px;
    border-radius: 8px;

    color: ${cssVar.colorText};

    background: ${cssVar.colorFillTertiary};
  `,
  containerDark: css`
    &:hover {
      background: '';
    }
  `,
  containerLight: css`
    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-size: 12px;
    text-overflow: ellipsis;
  `,
}));

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
      style={{ width: '100%' }}
      className={cn(
        cn(
          'flex flex-col gap-4',
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
          <BookOpenTextIcon color={cssVar.geekblue} /> {t('rag.referenceChunks')}
        </div>
        {createElement(showDetail ? ChevronDown : ChevronRight, {})}
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
