import { type AiProviderListItem } from '@/types/aiProvider';

type SearchableProvider = Pick<AiProviderListItem, 'description' | 'id' | 'name'>;

/**
 * The one match rule for provider search, shared by the left rail and the card
 * grid so both always show the same set. An empty query matches everything.
 */
export const matchesProviderKeyword = (provider: SearchableProvider, keyword: string): boolean => {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;

  return (
    provider.id.toLowerCase().includes(query) ||
    !!provider.name?.toLowerCase().includes(query) ||
    !!provider.description?.toLowerCase().includes(query)
  );
};

export const filterProviders = <T extends SearchableProvider>(list: T[], keyword: string): T[] =>
  keyword.trim() ? list.filter((provider) => matchesProviderKeyword(provider, keyword)) : list;
