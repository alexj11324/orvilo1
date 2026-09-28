import type { ComposioAppType, OrviloSkillProviderType } from '@orvilo/const';

export type ConnectorCatalogItem =
  | { provider: OrviloSkillProviderType; type: 'orvilo' }
  | { serverType: ComposioAppType; type: 'composio' };

const featuredProviderIds = new Set(['github', 'linear']);

/** Hide new service offers while keeping every existing grant reachable. */
export const getVisibleConnectorCatalog = (
  items: ConnectorCatalogItem[],
  installedOrviloIds: ReadonlySet<string>,
  installedComposioIds: ReadonlySet<string>,
): ConnectorCatalogItem[] =>
  items.filter((item) => {
    const id = item.type === 'orvilo' ? item.provider.id : item.serverType.identifier;
    return (
      featuredProviderIds.has(id) ||
      (item.type === 'orvilo' ? installedOrviloIds.has(id) : installedComposioIds.has(id))
    );
  });
