import { describe, expect, it } from 'vitest';

import {
  getMcpPresetConnectorIdentifier,
  matchMcpPresetByConnector,
  MCP_PRESET_CONNECTORS,
  normalizeMcpServerUrl,
} from './mcpPreset';

describe('mcpPreset', () => {
  it('gives every preset a unique id, url, and connector identifier', () => {
    const ids = MCP_PRESET_CONNECTORS.map((p) => p.id);
    const urls = MCP_PRESET_CONNECTORS.map((p) => normalizeMcpServerUrl(p.url));
    const identifiers = MCP_PRESET_CONNECTORS.map(getMcpPresetConnectorIdentifier);

    expect(new Set(ids).size).toBe(MCP_PRESET_CONNECTORS.length);
    expect(new Set(urls).size).toBe(MCP_PRESET_CONNECTORS.length);
    expect(new Set(identifiers).size).toBe(MCP_PRESET_CONNECTORS.length);
  });

  it('normalizes urls case-insensitively and strips trailing slashes', () => {
    expect(normalizeMcpServerUrl('HTTPS://MCP.Linear.APP/mcp/')).toBe('https://mcp.linear.app/mcp');
    expect(normalizeMcpServerUrl(undefined)).toBe('');
    expect(normalizeMcpServerUrl('  ')).toBe('');
  });

  it('matches a connector back to its preset by default identifier', () => {
    const match = matchMcpPresetByConnector({ identifier: 'github-mcp' });
    expect(match?.id).toBe('github');
  });

  it('matches a connector back to its preset by url regardless of case/trailing slash', () => {
    // The user can rename the identifier in the form; the endpoint is the
    // durable link between a custom connector and its preset row.
    const match = matchMcpPresetByConnector({
      identifier: 'my-renamed-connector',
      mcpServerUrl: 'HTTPS://MCP.LINEAR.APP/mcp/',
    });
    expect(match?.id).toBe('linear');
  });

  it('returns undefined for unrelated connectors', () => {
    expect(
      matchMcpPresetByConnector({
        identifier: 'my-server',
        mcpServerUrl: 'https://example.com/mcp',
      }),
    ).toBeUndefined();
    expect(matchMcpPresetByConnector({ identifier: 'my-server' })).toBeUndefined();
  });
});
