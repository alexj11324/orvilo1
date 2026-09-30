'use client';

import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { BotIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { DESKTOP_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import { useQueryState } from '@/hooks/useQueryParam';
import CateTag from '@/routes/(main)/memory/features/CateTag';
import DetailLoading from '@/routes/(main)/memory/features/DetailLoading';
import DetailNotFound from '@/routes/(main)/memory/features/DetailNotFound';
import DetailPanel from '@/routes/(main)/memory/features/DetailPanel';
import HashTags from '@/routes/(main)/memory/features/HashTags';
import HighlightedContent from '@/routes/(main)/memory/features/HighlightedContent';
import ProgressIcon from '@/routes/(main)/memory/features/ProgressIcon';
import SourceLink from '@/routes/(main)/memory/features/SourceLink';
import Time from '@/routes/(main)/memory/features/Time';
import { useUserMemoryStore } from '@/store/userMemory';
import { LayersEnum } from '@/types/userMemory';

import PreferenceDropdown from './PreferenceDropdown';

const styles = createStaticStyles(({ css, cssVar }) => ({
  suggestionsTitle: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const PreferenceRightPanel = memo(() => {
  const { t } = useTranslation('memory');
  const [preferenceId] = useQueryState('preferenceId', { clearOnDefault: true });
  const useFetchMemoryDetail = useUserMemoryStore((s) => s.useFetchMemoryDetail);

  const {
    data: preference,
    isLoading,
    error,
    mutate,
  } = useFetchMemoryDetail(preferenceId, LayersEnum.Preference);

  if (!preferenceId) return null;

  const content = preference && (
    <>
      <CateTag cate={preference.type} />
      <Text
        as={'h1'}
        fontSize={20}
        weight={'bold'}
        style={{
          lineHeight: 1.4,
          marginBottom: 0,
        }}
      >
        {preference.title || preference.type || t('preference.defaultType')}
      </Text>
      <div className="flex items-center gap-4 justify-between">
        <ProgressIcon
          showInfo
          format={(percent) => `${t('filter.sort.scorePriority')}: ${percent}%`}
          percent={(preference.scorePriority ?? 0) * 100}
        />
      </div>
      <div className="flex items-center gap-4 justify-between">
        <SourceLink source={preference.source} />
        <Time capturedAt={preference.capturedAt || preference.updatedAt || preference.createdAt} />
      </div>

      {preference.conclusionDirectives && (
        <HighlightedContent>{preference.conclusionDirectives}</HighlightedContent>
      )}

      {preference.suggestions && (
        <div className="flex flex-col gap-2 p-4" style={{ background: cssVar.colorFillSecondary }}>
          <div className={cn('flex items-center gap-1.5', styles.suggestionsTitle)}>
            <BotIcon size={16} />
            <span>{t('preference.suggestions')}</span>
          </div>
          <HighlightedContent>{preference.suggestions}</HighlightedContent>
        </div>
      )}

      <HashTags hashTags={preference.tags} />
    </>
  );

  return (
    <DetailPanel
      header={{
        right: preferenceId ? (
          <PreferenceDropdown id={preferenceId} size={DESKTOP_HEADER_ICON_SIZE} />
        ) : undefined,
      }}
    >
      <AsyncBoundary
        data={preference}
        empty={<DetailNotFound />}
        error={error}
        errorVariant={'page'}
        isEmpty={!preference}
        isLoading={isLoading}
        loading={<DetailLoading />}
        onRetry={() => mutate()}
      >
        {content}
      </AsyncBoundary>
    </DetailPanel>
  );
});

export default PreferenceRightPanel;
