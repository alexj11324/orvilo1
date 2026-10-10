import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useFileStore } from '@/store/file';
import { knowledgeBaseSelectors, useKnowledgeBaseStore } from '@/store/library';

import { usePageEditorStore } from '../store';

const styles = {
  breadcrumb: 'text-sm leading-5.5 text-muted-foreground',
  breadcrumbItem:
    'cursor-pointer transition-colors duration-(--ant-motion-duration-slow) hover:text-foreground',
  currentItem: 'font-medium text-foreground',
  separator: 'mx-2 text-foreground-quaternary',
};

interface FolderCrumb {
  id: string;
  name: string;
  slug: string;
}

const Breadcrumb = memo(() => {
  const { t } = useTranslation('file');

  const title = usePageEditorStore((s) => s.title);
  const knowledgeBaseId = usePageEditorStore((s) => s.knowledgeBaseId);
  const parentId = usePageEditorStore((s) => s.parentId);

  const knowledgeBaseName = useKnowledgeBaseStore(
    knowledgeBaseSelectors.getKnowledgeBaseNameById(knowledgeBaseId || ''),
  );

  // Fetch the parent folder to get its slug
  const useFetchKnowledgeItem = useFileStore((s) => s.useFetchKnowledgeItem);
  const { data: parentFolder } = useFetchKnowledgeItem(parentId);

  // Fetch folder breadcrumb chain from backend using parent folder's slug
  const useFetchFolderBreadcrumb = useFileStore((s) => s.useFetchFolderBreadcrumb);
  const { data: folderChain = [] } = useFetchFolderBreadcrumb(parentFolder?.slug || null);

  // If no parent folder data yet, don't render
  if (!parentFolder || !parentId) {
    return null;
  }

  const documentTitle = title || t('pageEditor.titlePlaceholder');

  return (
    <div className={cn('flex items-center flex-1 gap-0', styles.breadcrumb)}>
      {/* Knowledge Base (root) */}
      {knowledgeBaseId && (
        <>
          <span className={cn(styles.breadcrumbItem, 'cursor-default')}>
            {knowledgeBaseName || 'Knowledge Base'}
          </span>
          <span className={styles.separator}>/</span>
        </>
      )}

      {/* Folder chain */}
      {folderChain.map((folder: FolderCrumb) => (
        <div className="flex items-center gap-0" key={folder.id}>
          <span className={cn(styles.breadcrumbItem, 'cursor-default')}>{folder.name}</span>
          <span className={styles.separator}>/</span>
        </div>
      ))}

      {/* Current document title */}
      <span className={cn(styles.breadcrumbItem, styles.currentItem, 'cursor-default')}>
        {documentTitle}
      </span>
    </div>
  );
});

Breadcrumb.displayName = 'Breadcrumb';

export default Breadcrumb;
