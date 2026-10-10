import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { confirmModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { useScopedMemoryEditor } from '@/features/Memory/useScopedMemoryEditor';
import NavHeader from '@/features/NavHeader';
import FilterBar from '@/routes/(main)/memory/features/FilterBar';
import HighlightedContent from '@/routes/(main)/memory/features/HighlightedContent';
import { useExperienceMemory } from '@/store/userMemory/experienceMemory';
import { useMemorySession } from '@/store/userMemory/utils/session';

export default function PrimeMemory() {
  const session = useMemorySession();
  return <ExperienceManager key={session} />;
}

function ExperienceManager() {
  const openEditorModal = useScopedMemoryEditor();
  const { t } = useTranslation('memory');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<string>();
  const [failed, setFailed] = useState(false);
  const memory = useExperienceMemory(query, page);
  const edit = (entry?: { id: string; content: string; revision: number }) =>
    openEditorModal({
      value: entry?.content || '',
      onConfirm: async (value) => {
        if (entry) await memory.update(entry.id, entry.revision, value);
        else await memory.create(value);
      },
    });
  return (
    <div className="flex flex-col flex-1 h-full">
      <NavHeader
        left={<div className="font-bold text-foreground">{t('prime.title')}</div>}
        right={
          <Button
            className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
            variant="outline"
            onClick={() => edit()}
          >
            {t('prime.create')}
          </Button>
        }
      />
      <div className="flex flex-col gap-5 p-6 overflow-y-auto">
        <div className="text-foreground">{t('prime.description')}</div>
        <FilterBar
          searchValue={query}
          onSearch={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
        {failed && (
          <div className="text-foreground" role={'alert'}>
            {t('manager.failed')}
          </div>
        )}
        <AsyncBoundary
          data={memory.data}
          empty={<div className="text-foreground">{t('empty.search')}</div>}
          error={memory.error}
          isEmpty={memory.data?.items.length === 0}
          isLoading={memory.isLoading}
          onRetry={() => void memory.mutate()}
        >
          {memory.data?.items.map((entry) => (
            <div className="flex flex-col gap-3" key={entry.id}>
              <HighlightedContent>{entry.content}</HighlightedContent>
              {entry.source === 'legacy' ? (
                <div className="text-(--ant-color-text-description)">{t('prime.legacy')}</div>
              ) : (
                <div className="flex flex-row gap-2">
                  <Button
                    className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
                    disabled={pending === entry.id}
                    variant="outline"
                    onClick={() => edit(entry)}
                  >
                    {t('manager.edit')}
                  </Button>
                  <Button
                    className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
                    disabled={pending === entry.id}
                    variant="outline"
                    onClick={() =>
                      confirmModal({
                        title: t('manager.deleteTitle'),
                        content: t('manager.deleteConfirm'),
                        okText: t('manager.delete'),
                        cancelText: t('manager.cancel'),
                        okButtonProps: { danger: true },
                        onOk: async () => {
                          setPending(entry.id);
                          setFailed(false);
                          try {
                            await memory.remove(entry.id, entry.revision);
                          } catch {
                            setFailed(true);
                          } finally {
                            setPending(undefined);
                          }
                        },
                      })
                    }
                  >
                    {t('manager.delete')}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {memory.data && 'truncated' in memory.data && memory.data.truncated && (
            <div className="text-foreground">{t('prime.truncated')}</div>
          )}
        </AsyncBoundary>
        {!query && (
          <div className="flex flex-row gap-3">
            <Button
              className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
              disabled={page === 1 || memory.isLoading}
              variant="outline"
              onClick={() => setPage(page - 1)}
            >
              {t('manager.previous')}
            </Button>
            <div className="text-foreground">{page}</div>
            <Button
              className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
              variant="outline"
              disabled={
                !memory.data ||
                !('hasMore' in memory.data) ||
                !memory.data.hasMore ||
                memory.isLoading
              }
              onClick={() => setPage(page + 1)}
            >
              {t('manager.next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
