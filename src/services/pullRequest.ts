import { lambdaClient } from '@/libs/trpc/client';

class PullRequestService {
  addFileComment = (input: {
    body: string;
    id: string;
    line: number;
    path: string;
    side?: 'LEFT' | 'RIGHT';
  }) => lambdaClient.pullRequest.addFileComment.mutate(input);

  detail = (id: string) => lambdaClient.pullRequest.detail.query({ id });

  queue = (tab: 'created' | 'for-me') => lambdaClient.pullRequest.queue.query({ tab });

  replyThread = (input: { body: string; id: string; threadId: string }) =>
    lambdaClient.pullRequest.replyThread.mutate(input);

  submitReview = (input: {
    body?: string;
    event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';
    id: string;
  }) => lambdaClient.pullRequest.submitReview.mutate(input);
}

export const pullRequestService = new PullRequestService();
