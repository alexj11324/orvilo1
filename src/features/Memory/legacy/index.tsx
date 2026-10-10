import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { confirmModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { useScopedMemoryEditor } from '@/features/Memory/useScopedMemoryEditor';
import NavHeader from '@/features/NavHeader';
import FilterBar from '@/routes/(main)/memory/features/FilterBar';
import GridCard from '@/routes/(main)/memory/features/GridView/GridCard';
import HighlightedContent from '@/routes/(main)/memory/features/HighlightedContent';
import Loading from '@/routes/(main)/memory/features/Loading';
import MemoryEmpty from '@/routes/(main)/memory/features/MemoryEmpty';
import { useUserMemoryStore } from '@/store/userMemory';
import { createLegacyMemory, useLegacyMemoryPage } from '@/store/userMemory/useLegacyMemoryPage';
import { getMemorySession, useMemorySession } from '@/store/userMemory/utils/session';
import { LayersEnum } from '@/types/userMemory';

import { loadMemoryEditValue } from './loadEditValue';
import MemoryDetail from './MemoryDetail';

interface Props {
  layer: LayersEnum;
}

const removers = {
  [LayersEnum.Activity]: 'deleteActivity',
  [LayersEnum.Context]: 'deleteContext',
  [LayersEnum.Experience]: 'deleteExperience',
  [LayersEnum.Identity]: 'deleteIdentity',
  [LayersEnum.Preference]: 'deletePreference',
} as const;

export default function LegacyMemoryPage({ layer }: Props) {
  const session = useMemorySession();
  return <MemoryCollection key={`${session}:${layer}`} layer={layer} />;
}

function MemoryCollection({ layer }: Props) {
  const openEditorModal = useScopedMemoryEditor();
  const { t } = useTranslation('memory');
  const [selected, setSelected] = useState<string>();
  const [q, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState<string>();
  const { data, error, isLoading, mutate } = useLegacyMemoryPage(layer, page, q);
  const session = getMemorySession();

  const remove = (id: string) =>
    confirmModal({
      title: t('manager.deleteTitle'),
      content: t('manager.deleteConfirm'),
      cancelText: t('manager.cancel'),
      okText: t('manager.delete'),
      okButtonProps: { danger: true },
      onOk: async () => {
        if (session !== getMemorySession()) return;
        setPending(id);
        try {
          await useUserMemoryStore.getState()[removers[layer]](id);
          if (session === getMemorySession()) await mutate();
        } catch {
          if (session === getMemorySession()) setFeedback(t('manager.failed'));
        } finally {
          if (session === getMemorySession()) setPending(undefined);
        }
      },
    });

  return (
    <div className="flex flex-col flex-1 h-full">
      <NavHeader
        left={
          <div className="font-bold text-foreground">
            {t(
              (
                {
                  activity: 'tab.activities',
                  context: 'tab.contexts',
                  experience: 'tab.experiences',
                  identity: 'tab.identities',
                  preference: 'tab.preferences',
                } as const
              )[layer],
            )}
          </div>
        }
        right={
          <Button
            className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
            variant="outline"
            onClick={() =>
              openEditorModal({
                value: '',
                onConfirm: async (value) => {
                  await createLegacyMemory(layer, value, session);
                },
              })
            }
          >
            {t('manager.create')}
          </Button>
        }
      />
      <div className="flex flex-col gap-5 p-6 overflow-y-auto">
        <FilterBar
          searchValue={q}
          onSearch={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
        {selected && (
          <MemoryDetail id={selected} layer={layer} onClose={() => setSelected(undefined)} />
        )}
        {feedback && (
          <div className="text-foreground" role={'alert'}>
            {feedback}
          </div>
        )}
        <AsyncBoundary
          data={data}
          empty={<MemoryEmpty search={Boolean(q)} />}
          error={error}
          isEmpty={data?.items.length === 0}
          isLoading={isLoading}
          loading={<Loading />}
          onRetry={() => void mutate()}
        >
          {data?.items.map((row) => {
            const entry =
              row.layer === LayersEnum.Activity
                ? row.activity
                : row.layer === LayersEnum.Context
                  ? row.context
                  : row.layer === LayersEnum.Experience
                    ? row.experience
                    : row.layer === LayersEnum.Identity
                      ? row.identity
                      : row.preference;
            const content =
              row.layer === LayersEnum.Activity
                ? ''
                : row.layer === LayersEnum.Context
                  ? row.context.description
                  : row.layer === LayersEnum.Experience
                    ? row.experience.keyLearning || row.experience.situation
                    : row.layer === LayersEnum.Identity
                      ? row.identity.description
                      : row.preference.conclusionDirectives;
            return (
              <GridCard
                capturedAt={entry.createdAt}
                hashTags={entry.tags}
                key={entry.id}
                title={row.memory.title}
                actions={
                  <div className="flex flex-row gap-2">
                    <Button
                      className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
                      variant="outline"
                      onClick={() => setSelected(entry.id)}
                    >
                      {t('manager.details')}
                    </Button>
                    <Button
                      className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
                      disabled={pending === entry.id}
                      variant="outline"
                      onClick={async () => {
                        setPending(entry.id);
                        try {
                          const value = await loadMemoryEditValue(entry.id, layer, content || '');
                          if (session !== getMemorySession()) return;
                          openEditorModal({
                            value,
                            onConfirm: async (value) => {
                              if (session !== getMemorySession()) return;
                              await useUserMemoryStore
                                .getState()
                                .updateMemory(entry.id, value, layer);
                              if (session === getMemorySession()) await mutate();
                            },
                          });
                        } catch {
                          if (session === getMemorySession()) setFeedback(t('manager.failed'));
                        } finally {
                          if (session === getMemorySession()) setPending(undefined);
                        }
                      }}
                    >
                      {t('manager.edit')}
                    </Button>
                    <Button
                      className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
                      disabled={pending === entry.id}
                      variant="outline"
                      onClick={() => remove(entry.id)}
                    >
                      {t('manager.delete')}
                    </Button>
                  </div>
                }
              >
                <HighlightedContent>{content || ''}</HighlightedContent>
              </GridCard>
            );
          })}
        </AsyncBoundary>
        <div className="flex flex-row gap-3">
          <Button
            className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
            disabled={page === 1 || isLoading}
            variant="outline"
            onClick={() => setPage(page - 1)}
          >
            {t('manager.previous')}
          </Button>
          <div className="text-foreground">{page}</div>
          <Button
            className="px-3.5 rounded-(--radius-input) text-[13px] leading-none"
            disabled={!data || page * 20 >= data.total || isLoading}
            variant="outline"
            onClick={() => setPage(page + 1)}
          >
            {t('manager.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
