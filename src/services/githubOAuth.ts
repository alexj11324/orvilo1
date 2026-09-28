import { lambdaClient } from '@/libs/trpc/client';

class GitHubOAuthService {
  start = () => lambdaClient.githubOAuth.start.mutate();

  status = () => lambdaClient.githubOAuth.status.query();
}

export const githubOAuthService = new GitHubOAuthService();
