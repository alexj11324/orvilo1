import { lambdaClient } from '@/libs/trpc/client';

class LinearSyncService {
  issueLinks = (...args: Parameters<typeof lambdaClient.linearSync.issueLinks.query>) =>
    lambdaClient.linearSync.issueLinks.query(...args);

}

export const linearSyncService = new LinearSyncService();
