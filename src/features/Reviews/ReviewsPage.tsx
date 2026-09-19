'use client';

import { Flexbox } from '@lobehub/ui';
import { TabsIndicator, TabsList, TabsRoot, TabsTab, Text } from '@lobehub/ui/base-ui';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { mergeWorkQueryGroups } from '../MyWork/workQueryPaging';
import WorkQueryResults from '../MyWork/WorkQueryResults';

type ReviewTab = 'created' | 'for-me';

const resolveTab = (value: string | null): ReviewTab =>
  value === 'created' ? 'created' : 'for-me';

/**
 * `/reviews` — real review work, not a My issues tab. `for-me` lists tasks
 * awaiting my review plus pending non-task approvals addressed to me;
 * `created` lists reviews I requested.
 */
const ReviewsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get('tab'));

  const { data, error, isLoading } = useClientDataSWR(
    workAttentionKeys.reviews(workspaceId, tab),
    () => workAttentionService.reviews({ tab }),
  );
  const firstGroups = data?.data.groups ?? [];
  const queryHash = data?.data.queryHash;
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  useEffect(() => {
    setGroupTail([]);
  }, [queryHash, tab, workspaceId]);
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);

  const refresh = useCallback(async () => {
    setGroupTail([]);
    await mutate(workAttentionKeys.reviews(workspaceId, tab));
  }, [tab, workspaceId]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash) return;
      const next = await workAttentionService.reviews({
        afterId: last.id,
        groupKey,
        queryHash,
        tab,
      });
      setGroupTail((current) => mergeWorkQueryGroups(current, next.data.groups ?? []));
    },
    [groups, queryHash, tab],
  );

  const tabs = useMemo(
    () => [
      { key: 'for-me' as const, label: t('myWork.reviewsForMe') },
      { key: 'created' as const, label: t('myWork.reviewsCreated') },
    ],
    [t],
  );

  const writeTab = (next: ReviewTab) =>
    setSearchParams(next === 'for-me' ? {} : { tab: next }, { replace: true });

  const tasks = data?.data.tasks ?? [];
  const externalReviews = data?.data.externalReviews ?? [];

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.reviews')}
          </Text>
        }
      />
      <WideScreenContainer gap={12} paddingBlock={16} wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
        <TabsRoot value={tab} onValueChange={(value) => writeTab(value as ReviewTab)}>
          <TabsList>
            <TabsIndicator />
            {tabs.map((item) => (
              <TabsTab key={item.key} value={item.key}>
                {item.label}
              </TabsTab>
            ))}
          </TabsList>
        </TabsRoot>
        {error && tasks.length === 0 && externalReviews.length === 0 ? (
          <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
        ) : (
          <>
            {error ? (
              <AsyncError error={error} variant={'inline'} onRetry={() => void refresh()} />
            ) : null}
            <WorkQueryResults
              emptyLabel={t('myWork.externalReviewsEmpty')}
              externalReviews={externalReviews}
              groupBy={data?.data.groupBy}
              groups={groups}
              layout={'list'}
              loadMoreLabel={t('myWork.loadMore')}
              loading={isLoading}
              loadingLabel={t('myWork.loading')}
              tasks={tasks}
              total={data?.data.total}
              onLoadMoreGroup={(key) => void loadMoreGroup(key)}
            />
          </>
        )}
      </WideScreenContainer>
    </Flexbox>
  );
});

ReviewsPage.displayName = 'ReviewsPage';

export default ReviewsPage;
