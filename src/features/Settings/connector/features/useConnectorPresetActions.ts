'use client';

import {
  getMcpPresetConnectorIdentifier,
  MCP_PRESET_CONNECTORS,
  type McpPresetConnector,
} from '@orvilo/const';
import { type OrviloToolCustomPlugin } from '@orvilo/types';
import { useCallback, useState } from 'react';

import { type GitHubMcpCapability, useGitHubMcpConnect } from './useGitHubMcpConnect';

/**
 * Seed the connector form from a hosted-MCP preset: identifier, endpoint and
 * auth method pre-filled, everything still user-editable before save.
 */
const presetToPluginValue = (preset: McpPresetConnector): OrviloToolCustomPlugin => ({
  customParams: {
    description: preset.description,
    mcp: {
      auth: { type: preset.authType },
      type: 'http',
      url: preset.url,
    },
  },
  identifier: getMcpPresetConnectorIdentifier(preset),
  type: 'customPlugin',
});

export interface ConnectorPresetActions {
  /** Start adding / connecting a preset (managed GitHub flow, token form or OAuth form). */
  addPreset: (preset: McpPresetConnector) => void;
  closeForm: () => void;
  githubCapability?: Exclude<GitHubMcpCapability, 'app_oauth_configured'>;
  githubConnecting: boolean;
  githubGrantConnected?: boolean;
  githubTimedOut: boolean;
  /** Open the add-connector form (empty, or seeded when a preset plugin is set). */
  openForm: () => void;
  presetPlugin?: OrviloToolCustomPlugin;
  showForm: boolean;
}

/**
 * Connector-preset state shared by the list rows and the detail pane, so the
 * Connect action behaves the same wherever it is offered.
 */
export const useConnectorPresetActions = (
  onSelectConnector: (identifier: string) => void,
): ConnectorPresetActions => {
  const [presetPlugin, setPresetPlugin] = useState<OrviloToolCustomPlugin | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  const openPresetForm = useCallback((preset: McpPresetConnector) => {
    setPresetPlugin(presetToPluginValue(preset));
    setShowForm(true);
  }, []);
  const githubPreset = MCP_PRESET_CONNECTORS.find((preset) => preset.id === 'github');
  const {
    capability,
    connect: connectGitHub,
    connecting: githubConnecting,
    grantConnected: githubGrantConnected,
    timedOut: githubTimedOut,
  } = useGitHubMcpConnect(
    onSelectConnector,
    githubPreset ? () => openPresetForm(githubPreset) : undefined,
  );
  const githubCapability = capability === 'app_oauth_configured' ? undefined : capability;

  const addPreset = useCallback(
    (preset: McpPresetConnector) => {
      if (preset.managedAuth !== 'github-app' || githubCapability === 'pat_available') {
        openPresetForm(preset);
        return;
      }
      void connectGitHub();
    },
    [connectGitHub, githubCapability, openPresetForm],
  );

  return {
    addPreset,
    closeForm: () => {
      setShowForm(false);
      setPresetPlugin(undefined);
    },
    githubCapability,
    githubConnecting,
    githubGrantConnected,
    githubTimedOut,
    openForm: () => setShowForm(true),
    presetPlugin,
    showForm,
  };
};
