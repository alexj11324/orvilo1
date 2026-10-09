import { describe, expect, it } from 'vitest';

import {
  type ConnectorSelectionSources,
  fromMcpPresetSelectionId,
  isSelectionResolvable,
  toMcpPresetSelectionId,
} from './connectorSelection';

const sources: ConnectorSelectionSources = {
  agentConnectorIds: ['agent-row'],
  connectorIdentifiers: ['custom-linear'],
  isComposioCatalogId: (id) => id === 'gmail',
  isOrviloCatalogId: (id) => id === 'github',
  pluginIdentifiers: ['community-tool'],
  presetIds: ['github', 'linear'],
  serverIdentifiers: ['notion'],
};

describe('mcp preset selection ids', () => {
  it('round-trips and does not collide with the OAuth catalog id', () => {
    expect(toMcpPresetSelectionId('github')).not.toBe('github');
    expect(fromMcpPresetSelectionId(toMcpPresetSelectionId('github'))).toBe('github');
    expect(fromMcpPresetSelectionId('github')).toBeUndefined();
  });
});

describe('isSelectionResolvable', () => {
  it('keeps a not-connected preset row selected (GitHub row click)', () => {
    expect(
      isSelectionResolvable(
        { identifier: toMcpPresetSelectionId('github'), type: 'mcp-preset' },
        sources,
      ),
    ).toBe(true);
  });

  it('drops a preset that the list no longer offers', () => {
    expect(
      isSelectionResolvable(
        { identifier: toMcpPresetSelectionId('notion'), type: 'mcp-preset' },
        sources,
      ),
    ).toBe(false);
  });

  it('keeps not-connected OAuth catalog rows selected', () => {
    expect(isSelectionResolvable({ identifier: 'github', type: 'orvilo-connector' }, sources)).toBe(
      true,
    );
    expect(isSelectionResolvable({ identifier: 'gmail', type: 'plugin' }, sources)).toBe(true);
  });

  it('drops an unknown catalog entry', () => {
    expect(isSelectionResolvable({ identifier: 'ghost', type: 'orvilo-connector' }, sources)).toBe(
      false,
    );
    expect(isSelectionResolvable({ identifier: 'ghost', type: 'plugin' }, sources)).toBe(false);
  });

  it('resolves connected servers, connectors, plugins and agent connectors', () => {
    expect(isSelectionResolvable({ identifier: 'notion', type: 'plugin' }, sources)).toBe(true);
    expect(
      isSelectionResolvable({ identifier: 'custom-linear', type: 'mcp-connector' }, sources),
    ).toBe(true);
    expect(
      isSelectionResolvable({ identifier: 'community-tool', type: 'mcp-connector' }, sources),
    ).toBe(true);
    expect(
      isSelectionResolvable({ identifier: 'agent-row', type: 'agent-connector' }, sources),
    ).toBe(true);
    expect(isSelectionResolvable({ identifier: 'gone', type: 'mcp-connector' }, sources)).toBe(
      false,
    );
  });
});
