'use client';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileStore } from '@/store/file';
import { knowledgeBaseSelectors, useKnowledgeBaseStore } from '@/store/library';

import type { NativePageChromeState } from '../NativePageEditorAssembler';

/** Same folder item + slug breadcrumb chain as the existing page header.
 * Native metadata is explicit; no legacy PageEditor store/provider is read. */
export function NativePageBreadcrumb({ state }: { state: NativePageChromeState }) {
  const { t } = useTranslation(['file', 'common']);
  const useFetchKnowledgeItem = useFileStore((s) => s.useFetchKnowledgeItem);
  const { data: parent, error, mutate } = useFetchKnowledgeItem(state.parentId);
  const useFetchFolderBreadcrumb = useFileStore((s) => s.useFetchFolderBreadcrumb);
  const {
    data: chain = [],
    error: chainError,
    mutate: retryChain,
  } = useFetchFolderBreadcrumb(parent?.slug || null);
  const knowledgeBaseName = useKnowledgeBaseStore(
    knowledgeBaseSelectors.getKnowledgeBaseNameById(state.knowledgeBaseId || ''),
  );
  return (
    <nav
      aria-label={state.title || t('pageEditor.titlePlaceholder', { ns: 'file' })}
      className="min-w-0 text-sm text-muted-foreground"
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-2">
        {state.knowledgeBaseId ? (
          <li>
            {knowledgeBaseName || t('navPanel.library', { ns: 'common' })}
            <span aria-hidden="true" className="ms-2 text-foreground-quaternary">
              /
            </span>
          </li>
        ) : null}
        {state.parentId && !parent && !error ? (
          <li>
            <Skeleton className="h-5 w-20" />
          </li>
        ) : null}
        {error || chainError ? (
          <li>
            <Button
              size="compact"
              type="button"
              variant="link"
              onClick={() => {
                void mutate();
                void retryChain();
              }}
            >
              {t('retry', { ns: 'common' })}
            </Button>
          </li>
        ) : null}
        {chain.map((folder) => (
          <li key={folder.id}>
            {folder.name}
            <span aria-hidden="true" className="ms-2 text-foreground-quaternary">
              /
            </span>
          </li>
        ))}
        <li aria-current="page" className="min-w-0 truncate font-medium text-foreground">
          {state.title || t('pageEditor.titlePlaceholder', { ns: 'file' })}
        </li>
      </ol>
    </nav>
  );
}
