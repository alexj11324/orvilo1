import { Flexbox } from '@lobehub/ui';
import { Button, confirmModal, Text } from '@lobehub/ui/base-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
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
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        left={<Text weight={'bold'}>{t('prime.title')}</Text>}
        right={<Button onClick={() => edit()}>{t('prime.create')}</Button>}
      />
      <Flexbox gap={20} padding={24} style={{ overflowY: 'auto' }}>
        <Text>{t('prime.description')}</Text>
        <FilterBar
          searchValue={query}
          onSearch={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
        {failed && <Text role={'alert'}>{t('manager.failed')}</Text>}
        <AsyncBoundary
          data={memory.data}
          empty={<Text>{t('empty.search')}</Text>}
          error={memory.error}
          isEmpty={memory.data?.items.length === 0}
          isLoading={memory.isLoading}
          onRetry={() => void memory.mutate()}
        >
          {memory.data?.items.map((entry) => (
            <Flexbox gap={12} key={entry.id}>
              <HighlightedContent>{entry.content}</HighlightedContent>
              {entry.source === 'legacy' ? (
                <Text type={'secondary'}>{t('prime.legacy')}</Text>
              ) : (
                <Flexbox horizontal gap={8}>
                  <Button disabled={pending === entry.id} onClick={() => edit(entry)}>
                    {t('manager.edit')}
                  </Button>
                  <Button
                    disabled={pending === entry.id}
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
                </Flexbox>
              )}
            </Flexbox>
          ))}
          {memory.data && 'truncated' in memory.data && memory.data.truncated && (
            <Text>{t('prime.truncated')}</Text>
          )}
        </AsyncBoundary>
        {!query && (
          <Flexbox horizontal gap={12}>
            <Button disabled={page === 1 || memory.isLoading} onClick={() => setPage(page - 1)}>
              {t('manager.previous')}
            </Button>
            <Text>{page}</Text>
            <Button
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
          </Flexbox>
        )}
      </Flexbox>
    </Flexbox>
  );
}
