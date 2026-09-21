import { PROJECT_IDENTIFIER_REGEX } from '@orvilo/types';
import { kebabCase } from 'es-toolkit';
import { pinyin } from 'pinyin-pro';

const PROJECT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_IDENTIFIER_LENGTH = 4;

export interface CreateProjectDraft {
  avatar?: string;
  description?: string;
  identifier: string;
  leadUserId?: string;
  name: string;
  slug: string;
  startDate?: string;
  summary?: string;
  targetDate?: string;
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

  return {
    identifier,
    name,
    ...(slug ? { slug } : {}),
    ...(draft.avatar ? { avatar: draft.avatar } : {}),
    ...(draft.summary?.trim() ? { summary: draft.summary.trim() } : {}),
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.leadUserId ? { leadUserId: draft.leadUserId } : {}),
    ...(draft.teamId ? { teamId: draft.teamId } : {}),
    ...(draft.startDate ? { startDate: draft.startDate } : {}),
    ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
  };
};
