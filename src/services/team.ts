import { lambdaClient } from '@/libs/trpc/client';

export const teamService = {
  getDetail: (teamId: string) => lambdaClient.team.team.query({ teamId }),
};
