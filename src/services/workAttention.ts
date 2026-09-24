import type { MyWorkMode, VersionedDecision, WorkQuery } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

class WorkAttentionService {
  decide = (command: VersionedDecision) => {
    return lambdaClient.workAttention.decide.mutate(command);
  };

  favoriteList = () => lambdaClient.workAttention.favoriteList.query();

  favoritePin = (input: Parameters<typeof lambdaClient.workAttention.favoritePin.mutate>[0]) =>
    lambdaClient.workAttention.favoritePin.mutate(input);

  favoriteUnpin = (input: Parameters<typeof lambdaClient.workAttention.favoriteUnpin.mutate>[0]) =>
    lambdaClient.workAttention.favoriteUnpin.mutate(input);

  favoriteReorder = (
    input: Parameters<typeof lambdaClient.workAttention.favoriteReorder.mutate>[0],
  ) => lambdaClient.workAttention.favoriteReorder.mutate(input);

  feed = (input: Parameters<typeof lambdaClient.workAttention.feed.query>[0]) =>
    lambdaClient.workAttention.feed.query(input);

  feedSummary = () => lambdaClient.workAttention.feedSummary.query();

  moveBoard = (input: Parameters<typeof lambdaClient.workAttention.moveBoard.mutate>[0]) =>
    lambdaClient.workAttention.moveBoard.mutate(input);

  myWork = (input: {
    afterId?: string;
    delegated?: boolean;
    groupBy?: 'attention' | 'none' | 'status' | 'workflowCategory';
    groupKey?: string;
    layout?: 'board' | 'list';
    limit?: number;
    mode: MyWorkMode;
    noProject?: boolean;
    queryHash?: string;
    showTriage?: boolean;
  }) => lambdaClient.workAttention.myWork.query(input);

  reviews = (input: {
    afterId?: string;
    groupKey?: string;
    layout?: 'board' | 'list';
    limit?: number;
    queryHash?: string;
    tab: 'created' | 'for-me';
  }) => lambdaClient.workAttention.reviews.query(input);

  count = (input: { query: WorkQuery }) => lambdaClient.workAttention.count.query(input);

  facet = (input: {
    field: 'projectId' | 'status' | 'teamId' | 'workflowCategory';
    query: WorkQuery;
  }) => lambdaClient.workAttention.facet.query(input);

  query = (input: {
    afterId?: string;
    groupKey?: string;
    limit?: number;
    query: WorkQuery;
    queryHash?: string;
    showTriage?: boolean;
  }) => lambdaClient.workAttention.query.query(input);

  savedViewCreate = (
    input: Parameters<typeof lambdaClient.workAttention.savedViewCreate.mutate>[0],
  ) => lambdaClient.workAttention.savedViewCreate.mutate(input);

  savedViewDelete = (id: string) => lambdaClient.workAttention.savedViewDelete.mutate({ id });

  savedViewEvaluate = (input: {
    afterId?: string;
    groupKey?: string;
    id: string;
    limit?: number;
    queryHash?: string;
  }) => lambdaClient.workAttention.savedViewEvaluate.query(input);

  savedViewGet = (id: string) => lambdaClient.workAttention.savedViewGet.query({ id });

  savedViewList = () => lambdaClient.workAttention.savedViewList.query();

  savedViewUpdate = (
    input: Parameters<typeof lambdaClient.workAttention.savedViewUpdate.mutate>[0],
  ) => lambdaClient.workAttention.savedViewUpdate.mutate(input);

  search = (input: {
    limitPerType?: number;
    query: string;
    type?: 'project' | 'savedView' | 'task' | 'team';
  }) => lambdaClient.workAttention.search.query(input);

  /** Authorized, keyset-paginated project options for `projectId` filter rows. */
  projectOptions = (input: { afterId?: string; ids?: string[]; limit?: number; query?: string }) =>
    lambdaClient.workAttention.projectOptions.query(input);

  /** Cycle options across readable teams or scoped to one team — one query. */
  cycleOptions = (input: { ids?: string[]; limit?: number; query?: string; teamId?: string }) =>
    lambdaClient.workAttention.cycleOptions.query(input);

  subscribe = (taskId: string) => lambdaClient.workAttention.subscribe.mutate({ taskId });

  triage = (input: Parameters<typeof lambdaClient.workAttention.triage.mutate>[0]) =>
    lambdaClient.workAttention.triage.mutate(input);

  unsubscribe = (taskId: string) => lambdaClient.workAttention.unsubscribe.mutate({ taskId });
}

export const workAttentionService = new WorkAttentionService();
