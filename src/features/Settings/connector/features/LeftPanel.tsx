'use client';

import {
  getMcpPresetConnectorIdentifier,
  MCP_PRESET_CONNECTORS,
  type McpPresetConnector,
} from '@orvilo/const';
import { type OrviloToolCustomPlugin } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { Grid2x2Plus } from 'lucide-react';
import { createElement, memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { CustomConnectorModal } from '@/features/Connectors';

import { type ConnectorDetailType } from './ConnectorDetail';
import ConnectorList from './ConnectorList';
import { useGitHubMcpConnect } from './useGitHubMcpConnect';

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    overflow-y: auto;
    flex: 1;
    padding-block: 4px;
    padding-inline: 8px;
  `,
  header: css`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    height: 42px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  root: css`
    overflow-y: auto;
    display: flex;
    flex-direction: column;

    width: 300px;
    min-width: 260px;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

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

interface LeftPanelProps {
  onSelect: (identifier: string, type: ConnectorDetailType) => void;
  selectedIdentifier?: string;
}

const LeftPanel = memo<LeftPanelProps>(({ onSelect, selectedIdentifier }) => {
  const { t } = useTranslation('setting');
  const [presetPlugin, setPresetPlugin] = useState<OrviloToolCustomPlugin | undefined>(undefined);
  const [showAddConnector, setShowAddConnector] = useState(false);
  const selectGitHub = useCallback(
    (identifier: string) => onSelect(identifier, 'mcp-connector'),
    [onSelect],
  );
  const openPresetForm = useCallback((preset: McpPresetConnector) => {
    setPresetPlugin(presetToPluginValue(preset));
    setShowAddConnector(true);
  }, []);
  const githubPreset = MCP_PRESET_CONNECTORS.find((preset) => preset.id === 'github');
  const {
    capability: githubCapability,
    connect: connectGitHub,
    connecting: githubConnecting,
    grantConnected: githubGrantConnected,
    timedOut: githubTimedOut,
  } = useGitHubMcpConnect(
    selectGitHub,
    githubPreset ? () => openPresetForm(githubPreset) : undefined,
  );

  const closeModal = () => {
    setShowAddConnector(false);
    setPresetPlugin(undefined);
  };

  return (
    <>
      <div className={styles.root}>
        <div className={styles.header}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {t('skillView.connectors', 'Connectors')}
          </span>

          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Single action: add a custom OAuth connector. */}
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t('connector.add.title', {
                defaultValue: 'Add Custom Connector',
                ns: 'tool',
              })}
              title={t('connector.add.title', {
                defaultValue: 'Add Custom Connector',
                ns: 'tool',
              })}
              onClick={() => setShowAddConnector(true)}
            >
              {createElement(Grid2x2Plus)}
            </Button>
          </div>
        </div>

        <div className={styles.body}>
          <ConnectorList
            githubConnecting={githubConnecting}
            githubGrantConnected={githubGrantConnected}
            githubTimedOut={githubTimedOut}
            selectedIdentifier={selectedIdentifier}
            githubCapability={
              githubCapability === 'app_oauth_configured' ? undefined : githubCapability
            }
            onConnectGitHub={() => void connectGitHub()}
            onSelect={onSelect}
            onAddPreset={(preset) => {
              openPresetForm(preset);
            }}
          />
        </div>
      </div>
      <CustomConnectorModal
        open={showAddConnector}
        presetPlugin={presetPlugin}
        onClose={closeModal}
      />
    </>
  );
});

LeftPanel.displayName = 'ConnectorSettingsLeftPanel';

export default LeftPanel;
