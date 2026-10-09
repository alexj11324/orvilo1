'use client';

import isEqual from 'fast-deep-equal';
import {
  AudioLines,
  BoltIcon,
  Grid3x3Icon,
  ImageIcon,
  MessageSquareTextIcon,
  MicIcon,
  VideoIcon,
} from 'lucide-react';
import { memo, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Frame, FramePanel } from '@/components/reui/frame';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/useIsMobile';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';

import DisabledModels from './DisabledModels';
import EmptyModels from './EmptyModels';
import EnabledModelList from './EnabledModelList';
import ModelTitle from './ModelTitle';
import ModelToolbar from './ModelToolbar';
import { type ProviderSettingsContextValue } from './ProviderSettingsContext';
import { ProviderSettingsContext } from './ProviderSettingsContext';
import SearchResult from './SearchResult';
import SkeletonList from './SkeletonList';

interface ContentProps {
  id: string;
}

const Content = memo<ContentProps>(({ id }) => {
  // preload common namespace to avoid Suspense remount when child components start using it (e.g. infinite scroll loading text)
  const { t } = useTranslation(['modelProvider', 'common']);
  const [activeTab, setActiveTab] = useState('all');

  const [isSearching, isEmpty, useFetchAiProviderModels] = useAiInfraStore((s) => [
    !!s.modelSearchKeyword,
    aiModelSelectors.isEmptyAiProviderModelList(s),
    s.useFetchAiProviderModels,
  ]);

  const allModels = useAiInfraStore(aiModelSelectors.filteredAiProviderModelList, isEqual);

  const { isLoading, error, mutate } = useFetchAiProviderModels(id);

  // Count models by type (for all models, not just enabled)
  const modelCounts = useMemo(() => {
    const counts = {
      all: allModels.length,
      asr: 0,
      chat: 0,
      embedding: 0,
      image: 0,
      tts: 0,
      video: 0,
    };

    allModels.forEach((model) => {
      const type = model.type;
      if (type && Object.prototype.hasOwnProperty.call(counts, type)) {
        counts[type as keyof typeof counts]++;
      }
    });

    return counts;
  }, [allModels]);

  // Tab definitions with counts (only show tabs with models > 0, except 'all' tab)
  const tabs = useMemo(() => {
    const formatTabLabel = (baseLabel: string, count: number) =>
      count > 0 ? `${baseLabel} (${count})` : baseLabel;

    const allTabs = [
      {
        count: modelCounts.all,
        icon: Grid3x3Icon,
        key: 'all',
        label: formatTabLabel(t('providerModels.tabs.all'), modelCounts.all),
      },
      {
        count: modelCounts.chat,
        icon: MessageSquareTextIcon,
        key: 'chat',
        label: formatTabLabel(t('providerModels.tabs.chat'), modelCounts.chat),
      },
      {
        count: modelCounts.image,
        icon: ImageIcon,
        key: 'image',
        label: formatTabLabel(t('providerModels.tabs.image'), modelCounts.image),
      },
      {
        count: modelCounts.video,
        icon: VideoIcon,
        key: 'video',
        label: formatTabLabel(t('providerModels.tabs.video'), modelCounts.video),
      },
      {
        count: modelCounts.embedding,
        icon: BoltIcon,
        key: 'embedding',
        label: formatTabLabel(t('providerModels.tabs.embedding'), modelCounts.embedding),
      },
      {
        count: modelCounts.asr,
        icon: MicIcon,
        key: 'asr',
        label: formatTabLabel(t('providerModels.tabs.asr'), modelCounts.asr),
      },
      {
        count: modelCounts.tts,
        icon: AudioLines,
        key: 'tts',
        label: formatTabLabel(t('providerModels.tabs.tts'), modelCounts.tts),
      },
    ];

    // Only show tabs that have models (count > 0), but always show 'all' tab
    return allTabs.filter((tab) => tab.key === 'all' || tab.count > 0);
  }, [modelCounts, t]);

  // Ensure active tab is available, fallback to 'all' if current tab is hidden
  const availableTabKeys = tabs.map((tab) => tab.key);
  const currentActiveTab = availableTabKeys.includes(activeTab) ? activeTab : 'all';

  if (isLoading && isEmpty) return <SkeletonList />;

  // Error before empty: a failed model-list fetch must not render as
  // "no models yet" (EmptyModels) — surface the reason + Retry (ux Read §1.1).
  if (error && isEmpty)
    return <AsyncError error={error} variant={'block'} onRetry={() => mutate()} />;

  if (isSearching) return <SearchResult />;

  return isEmpty ? (
    <EmptyModels provider={id} />
  ) : (
    <>
      <Tabs className="px-3 pt-2 pb-1" value={currentActiveTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map(({ icon: TabIcon, key, label }) => (
            <TabsTrigger className="flex-none" key={key} value={key}>
              <TabIcon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <EnabledModelList activeTab={currentActiveTab} />
      <DisabledModels activeTab={currentActiveTab} providerId={id} />
    </>
  );
});

interface ModelListProps extends ProviderSettingsContextValue {
  id: string;
}

const ModelList = memo<ModelListProps>(
  ({ id, showModelFetcher, sdkType, showAddNewModel, showDeployName, modelEditable = true }) => {
    const mobile = useIsMobile();

    return (
      <ProviderSettingsContext
        value={{ modelEditable, sdkType, showAddNewModel, showDeployName, showModelFetcher }}
      >
        <section
          className={mobile ? 'flex flex-col gap-2 bg-card px-3 pb-4' : 'flex flex-col gap-2 pb-4'}
        >
          <ModelTitle provider={id} />
          <Frame dense className="[--frame-radius:var(--radius-card)]">
            <FramePanel className="p-0">
              <ModelToolbar
                provider={id}
                showAddNewModel={showAddNewModel}
                showModelFetcher={showModelFetcher}
              />
              <Suspense fallback={<SkeletonList />}>
                <Content id={id} />
              </Suspense>
            </FramePanel>
          </Frame>
        </section>
      </ProviderSettingsContext>
    );
  },
);

export default ModelList;
