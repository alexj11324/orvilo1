import { PROJECT_IDENTIFIER_REGEX, type ProjectPriority, type ProjectStatus } from '@orvilo/types';
import { kebabCase } from 'es-toolkit';
import { pinyin } from 'pinyin-pro';

import type { ProjectDatePrecision } from './projectPlanningDate';

const PROJECT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_IDENTIFIER_LENGTH = 4;

export const PROJECT_PRIORITIES = [0, 1, 2, 3, 4] as const;
export type { ProjectPriority };

const CREATEABLE_PROJECT_STATUSES = [
  'backlog',
  'planned',
  'active',
  'paused',
  'canceled',
  'archived',
] as readonly string[];

const isCreateableProjectStatus = (status: ProjectStatus | undefined): status is ProjectStatus =>
  status !== undefined && CREATEABLE_PROJECT_STATUSES.includes(status);

export type ProjectDependencyType = 'blockedBy' | 'blocking';

export interface CreateProjectDependency {
  projectId: string;
  type: ProjectDependencyType;
}

export interface CreateProjectMilestone {
  date?: string;
  description?: string;
  name: string;
}

export interface CreateProjectDraft {
  avatar?: string;
  dependencies?: CreateProjectDependency[];
  description?: string;
  identifier: string;
  labelIds?: string[];
  leadUserId?: string;
  memberIds?: string[];
  milestones?: CreateProjectMilestone[];
  name: string;
  newLabelNames?: string[];
  priority?: ProjectPriority;
  slug: string;
  startDate?: string;
  startDatePrecision?: ProjectDatePrecision;
  status?: ProjectStatus;
  summary?: string;
  targetDate?: string;
  targetDatePrecision?: ProjectDatePrecision;
  teamId?: string;
}

export interface ProjectFieldSuggestions {
  identifier: string;
  slug: string;
}

export const getProjectFieldSuggestions = (name: string): ProjectFieldSuggestions => {
  const normalizedName = name.trim();
  if (!normalizedName) return { identifier: '', slug: '' };

  const transliteratedName = pinyin(normalizedName, {
    nonZh: 'consecutive',
    toneType: 'none',
    type: 'array',
  }).join(' ');
  const slug = kebabCase(transliteratedName).replaceAll(/[^a-z0-9-]/g, '');
  const parts = slug.split('-').filter(Boolean);
  const initials = parts.map((part) => part[0]).join('');
  const compactName = parts.join('');
  const identifierSource = initials.length >= 3 ? initials : compactName;
  const identifier = (identifierSource.replace(/^[^a-z]+/, '') || 'prj')
    .slice(0, PROJECT_IDENTIFIER_LENGTH)
    .padEnd(3, 'x')
    .toUpperCase();

  return { identifier, slug };
};

export const isProjectIdentifierValid = (identifier: string) =>
  PROJECT_IDENTIFIER_REGEX.test(identifier.trim().toUpperCase());

export const isProjectSlugValid = (slug: string) => {
  const normalizedSlug = slug.trim().toLowerCase();
  return !normalizedSlug || PROJECT_SLUG_REGEX.test(normalizedSlug);
};

export const getCreateProjectInput = (draft: CreateProjectDraft) => {
  const identifier = draft.identifier.trim().toUpperCase();
  const name = draft.name.trim();
  const slug = draft.slug.trim().toLowerCase();

  if (!name || !isProjectIdentifierValid(identifier) || !isProjectSlugValid(slug)) {
    return null;
  }

  if (draft.startDate && draft.targetDate && draft.targetDate < draft.startDate) return null;

  const newLabelNames = [
    ...new Set((draft.newLabelNames ?? []).map((label) => label.trim())),
  ].filter(Boolean);
  const milestones = (draft.milestones ?? [])
    .map((milestone) => ({
      ...(milestone.date ? { date: milestone.date } : {}),
      ...(milestone.description?.trim() ? { description: milestone.description.trim() } : {}),
      name: milestone.name.trim(),
    }))
    .filter((milestone) => milestone.name);
  const status = isCreateableProjectStatus(draft.status) ? draft.status : undefined;
  const priority = PROJECT_PRIORITIES.includes(draft.priority) ? draft.priority : undefined;

  return {
    identifier,
    name,
    ...(slug ? { slug } : {}),
    ...(draft.avatar ? { avatar: draft.avatar } : {}),
    ...(draft.summary?.trim() ? { summary: draft.summary.trim() } : {}),
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.leadUserId ? { leadUserId: draft.leadUserId } : {}),
    ...(draft.memberIds?.length ? { memberIds: draft.memberIds } : {}),
    ...(draft.labelIds?.length ? { labelIds: draft.labelIds } : {}),
    ...(newLabelNames.length ? { newLabelNames } : {}),
    ...(status ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(draft.dependencies?.length ? { dependencies: draft.dependencies } : {}),
    ...(milestones.length ? { milestones } : {}),
    ...(draft.teamId ? { teamId: draft.teamId } : {}),
    ...(draft.startDate ? { startDate: draft.startDate } : {}),
    ...(draft.startDate && draft.startDatePrecision
      ? { startDatePrecision: draft.startDatePrecision }
      : {}),
    ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
    ...(draft.targetDate && draft.targetDatePrecision
      ? { targetDatePrecision: draft.targetDatePrecision }
      : {}),
  };
};
