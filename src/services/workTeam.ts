import { lambdaClient } from '@/libs/trpc/client';

class WorkTeamService {
  team = (...args: Parameters<typeof lambdaClient.team.team.query>) =>
    lambdaClient.team.team.query(...args);
  teams = (...args: Parameters<typeof lambdaClient.team.teams.query>) =>
    lambdaClient.team.teams.query(...args);
  updateLink = (...args: Parameters<typeof lambdaClient.teamResource.updateLink.mutate>) =>
    lambdaClient.teamResource.updateLink.mutate(...args);
  createLink = (...args: Parameters<typeof lambdaClient.teamResource.createLink.mutate>) =>
    lambdaClient.teamResource.createLink.mutate(...args);
  renameSection = (...args: Parameters<typeof lambdaClient.teamResource.renameSection.mutate>) =>
    lambdaClient.teamResource.renameSection.mutate(...args);
  createSection = (...args: Parameters<typeof lambdaClient.teamResource.createSection.mutate>) =>
    lambdaClient.teamResource.createSection.mutate(...args);
  queryDocuments = (...args: Parameters<typeof lambdaClient.document.queryDocuments.query>) =>
    lambdaClient.document.queryDocuments.query(...args);
  attachDocument = (...args: Parameters<typeof lambdaClient.teamResource.attachDocument.mutate>) =>
    lambdaClient.teamResource.attachDocument.mutate(...args);
  createDocument = (...args: Parameters<typeof lambdaClient.teamResource.createDocument.mutate>) =>
    lambdaClient.teamResource.createDocument.mutate(...args);
  detachDocument = (...args: Parameters<typeof lambdaClient.teamResource.detachDocument.mutate>) =>
    lambdaClient.teamResource.detachDocument.mutate(...args);
  removeLink = (...args: Parameters<typeof lambdaClient.teamResource.removeLink.mutate>) =>
    lambdaClient.teamResource.removeLink.mutate(...args);
  moveResource = (...args: Parameters<typeof lambdaClient.teamResource.moveResource.mutate>) =>
    lambdaClient.teamResource.moveResource.mutate(...args);
  deleteSection = (...args: Parameters<typeof lambdaClient.teamResource.deleteSection.mutate>) =>
    lambdaClient.teamResource.deleteSection.mutate(...args);
  list = (...args: Parameters<typeof lambdaClient.teamResource.list.query>) =>
    lambdaClient.teamResource.list.query(...args);
  moveTaskToTeam = (...args: Parameters<typeof lambdaClient.team.moveTaskToTeam.mutate>) =>
    lambdaClient.team.moveTaskToTeam.mutate(...args);
}

export const workTeamService = new WorkTeamService();
