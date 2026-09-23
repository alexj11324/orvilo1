import { AGENT_CHAT_TOPIC_URL, GROUP_CHAT_TOPIC_URL, GROUP_CHAT_URL } from '@orvilo/const';

import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import type { GlobalSearchResult } from '@/services/globalSearch';

import {
  GLOBAL_SEARCH_DISPLAY_TYPES,
  type GlobalSearchGroup,
  isGlobalSearchDisplayType,
} from './types';

/**
 * Group a flat merged result list into display sections. Work types lead so a
 * Linear-style surface shows issues, then projects, then views, then teams
 * before any content results. Marketplace types (`mcp`, `plugin`,
 * `communityAgent`) and `pageContent` are dropped — the palette renders the
 * same exclusion.
 */
export const groupSearchResults = (results: readonly GlobalSearchResult[]): GlobalSearchGroup[] => {
  const byType = new Map<string, GlobalSearchResult[]>();
  for (const result of results) {
    if (!isGlobalSearchDisplayType(result.type)) continue;
    const list = byType.get(result.type) ?? [];
    list.push(result);
    byType.set(result.type, list);
  }
  return GLOBAL_SEARCH_DISPLAY_TYPES.filter((type) => byType.has(type)).map((type) => ({
    items: byType.get(type) ?? [],
    type,
  }));
};

/**
 * Secondary line under the title. Work results carry their identifier here —
 * the task identifier (`ORV-123`) or the team key — matching Linear's search
 * rows. Content results carry a description/snippet when the backend has one.
 */
export const globalSearchResultSubtitle = (result: GlobalSearchResult): string | null =>
  result.description ?? null;

/**
 * Where selecting a result navigates. Mirrors the CommandMenu mapping without
 * importing palette internals; `null` means the type has no destination.
 */
export const globalSearchResultHref = (result: GlobalSearchResult): string | null => {
  switch (result.type) {
    case 'task': {
      return taskDetailPath(result.id, undefined, result.title);
    }
    case 'team': {
      return `/teams/${result.id}`;
    }
    case 'project': {
      return `/project/${result.id}`;
    }
    case 'savedView': {
      return `/views/${result.id}`;
    }
    case 'agent': {
      return `/agent/${result.id}?agent=${result.id}`;
    }
    case 'chatGroup': {
      return `/group/${result.id}`;
    }
    case 'topic': {
      if (result.agentId) return AGENT_CHAT_TOPIC_URL(result.agentId, result.id);
      if (result.groupId) return GROUP_CHAT_TOPIC_URL(result.groupId, result.id);
      return '/';
    }
    case 'message': {
      if (result.topicId && result.agentId) {
        return `${AGENT_CHAT_TOPIC_URL(result.agentId, result.topicId)}#${result.id}`;
      }
      if (result.topicId && result.groupId) {
        return `${GROUP_CHAT_TOPIC_URL(result.groupId, result.topicId)}#${result.id}`;
      }
      if (result.agentId) return `/agent/${result.agentId}#${result.id}`;
      if (result.groupId) return `${GROUP_CHAT_URL(result.groupId)}#${result.id}`;
      return '/';
    }
    case 'file': {
      return result.knowledgeBaseId
        ? `/resource/library/${result.knowledgeBaseId}?file=${result.id}`
        : `/resource?file=${result.id}`;
    }
    case 'page': {
      return `/resource?file=${result.id}`;
    }
    case 'folder': {
      if (result.knowledgeBaseId && result.slug) {
        return `/resource/library/${result.knowledgeBaseId}/${result.slug}`;
      }
      if (result.slug) return `/resource/library/${result.slug}`;
      return '/resource/library';
    }
    case 'memory': {
      return `/memory/preferences?preferenceId=${result.id}`;
    }
    case 'knowledgeBase': {
      return `/resource/library/${result.id}`;
    }
    default: {
      return null;
    }
  }
};
