import { describe, expect, it } from 'vitest';

import {
  type ConnectorCatalogItem,
  getVisibleConnectorCatalog,
} from './connectorCatalogVisibility';

const orvilo = (id: string) => ({ provider: { id }, type: 'orvilo' }) as ConnectorCatalogItem;
const composio = (id: string) =>
  ({ serverType: { identifier: id }, type: 'composio' }) as ConnectorCatalogItem;

describe('getVisibleConnectorCatalog', () => {
  it('shows GitHub and Linear offers while hiding other services without grants', () => {
    const items = [orvilo('github'), composio('linear'), orvilo('notion'), composio('slack')];
    expect(getVisibleConnectorCatalog(items, new Set(), new Set())).toEqual(items.slice(0, 2));
  });

  it('keeps existing service grants visible regardless of their status', () => {
    const items = [orvilo('notion'), composio('slack')];
    // An existing failed or pending grant still has a server record and must
    // remain available for inspection, retry, or disconnection.
    expect(getVisibleConnectorCatalog(items, new Set(['notion']), new Set(['slack']))).toEqual(
      items,
    );
  });
});
