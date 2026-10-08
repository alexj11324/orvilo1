import { lambdaClient } from '@/libs/trpc/client';

export const taskMenuService = {
  clearDuplicate: (input: { id: string; expectedDomainRevision: number }) =>
    lambdaClient.taskMenu.clearDuplicate.mutate(input),
  addLink: (input: { id: string; kind: 'link' | 'pull_request'; title?: string; url: string }) =>
    lambdaClient.taskMenu.addLink.mutate(input),
  descriptionHistory: (input: { id: string; beforeRevision?: number; limit?: number }) =>
    lambdaClient.taskMenu.descriptionHistory.query(input),
  links: (id: string) => lambdaClient.taskMenu.links.query({ id }),
  removeLink: (id: string, linkId: string) =>
    lambdaClient.taskMenu.removeLink.mutate({ id, linkId }),
  restoreDescription: (input: { id: string; historyId: string; expectedDomainRevision: number }) =>
    lambdaClient.taskMenu.restoreDescription.mutate(input),
  convertToProject: (input: {
    id: string;
    expectedDomainRevision: number;
    name: string;
    identifier: string;
    issueName: string;
  }) => lambdaClient.taskMenu.convertToProject.mutate(input),
  convertToRecurring: (input: {
    id: string;
    expectedDomainRevision: number;
    firstDueDate: string;
    cadence: 'day' | 'week' | 'month' | 'year';
    interval?: number;
    timezone: string;
  }) => lambdaClient.taskMenu.convertToRecurring.mutate(input),
  convertToTemplate: (input: { id: string; expectedDomainRevision: number; name: string }) =>
    lambdaClient.taskMenu.convertToTemplate.mutate(input),
  copyIssue: (input: {
    id: string;
    expectedDomainRevision: number;
    name?: string;
    includeSubIssues?: boolean;
    copyLabels?: boolean;
    copyAssignees?: boolean;
    copyDueDate?: boolean;
    copyProject?: boolean;
    copyTeam?: boolean;
  }) => lambdaClient.taskMenu.copyIssue.mutate(input),
  createFromTemplate: (input: { templateId: string; name?: string }) =>
    lambdaClient.taskMenu.createFromTemplate.mutate(input),
  createRelated: (input: {
    id: string;
    expectedDomainRevision: number;
    kind: 'related' | 'sub_issue' | 'parent' | 'blocked' | 'blocking';
    name: string;
    instruction?: string;
  }) => lambdaClient.taskMenu.createRelated.mutate(input),
  markDuplicate: (input: { id: string; targetId: string; expectedDomainRevision: number }) =>
    lambdaClient.taskMenu.markDuplicate.mutate(input),
  recurrence: (id: string) => lambdaClient.taskMenu.recurrence.query({ id }),
  removeRecurrence: (id: string) => lambdaClient.taskMenu.removeRecurrence.mutate({ id }),
  setRecurrenceEnabled: (input: { id: string; enabled: boolean }) =>
    lambdaClient.taskMenu.setRecurrenceEnabled.mutate(input),
  templates: () => lambdaClient.taskMenu.templates.query(),
};
