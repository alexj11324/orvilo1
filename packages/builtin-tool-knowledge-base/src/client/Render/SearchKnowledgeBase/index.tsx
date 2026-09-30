'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';

import type { SearchKnowledgeBaseArgs, SearchKnowledgeBaseState } from '../../../types';
import FileItem from './Item';

const SearchKnowledgeBase = memo<
  BuiltinRenderProps<SearchKnowledgeBaseArgs, SearchKnowledgeBaseState>
>(({ pluginState }) => {
  const { t } = useTranslation('plugin');
  const { fileResults } = pluginState || {};

  if (!fileResults || fileResults.length === 0) {
    return <SimpleEmpty description={t('builtins.orvilo-knowledge-base.inspector.noResults')} />;
  }

  return (
    <div className="flex flex-row gap-2 flex-wrap">
      {fileResults.map((file, index) => {
        return <FileItem index={index} key={file.fileId} {...file} />;
      })}
    </div>
  );
});

export default SearchKnowledgeBase;
