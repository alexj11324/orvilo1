import type { AcceptanceCommentList, CreateAcceptanceCommentInput } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

class AcceptanceCommentService {
  create = (
    _input: CreateAcceptanceCommentInput,
  ): ReturnType<typeof lambdaClient.acceptanceComment.create.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  delete = (_id: string): ReturnType<typeof lambdaClient.acceptanceComment.delete.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  list = (acceptanceId: string): Promise<AcceptanceCommentList> =>
    lambdaClient.acceptanceComment.list.query({ acceptanceId });

  react = (
    _id: string,
    _emoji: string,
    _on: boolean,
  ): ReturnType<typeof lambdaClient.acceptanceComment.react.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );

  setResolved = (
    _id: string,
    _resolved: boolean,
  ): ReturnType<typeof lambdaClient.acceptanceComment.setResolved.mutate> =>
    Promise.reject(
      new Error('Standalone Acceptance/Verify is read-only. Use the Issue Checklist.'),
    );
}

export const acceptanceCommentService = new AcceptanceCommentService();
