'use client';

import { createStaticStyles } from 'antd-style';
import { Grid2x2Plus } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import ConnectorList from './ConnectorList';
import { type ConnectorDetailType } from './connectorSelection';
import { type ConnectorPresetActions } from './useConnectorPresetActions';

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

interface LeftPanelProps {
  onSelect: (identifier: string, type: ConnectorDetailType) => void;
  presetActions: ConnectorPresetActions;
  selectedIdentifier?: string;
}

const LeftPanel = memo<LeftPanelProps>(({ onSelect, presetActions, selectedIdentifier }) => {
  const { t } = useTranslation('setting');

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className="text-sm font-semibold">{t('skillView.connectors', 'Connectors')}</span>

        <div className="flex min-w-0 flex-row gap-1.5">
          {/* Single action: add a custom OAuth connector. */}
          <Button
            size="sm"
            variant="outline"
            title={t('connector.add.title', {
              defaultValue: 'Add Custom Connector',
              ns: 'tool',
            })}
            onClick={presetActions.openForm}
          >
            {createElement(Grid2x2Plus)}
          </Button>
        </div>
      </div>

      <div className={styles.body}>
        <ConnectorList
          githubCapability={presetActions.githubCapability}
          githubConnecting={presetActions.githubConnecting}
          githubGrantConnected={presetActions.githubGrantConnected}
          githubTimedOut={presetActions.githubTimedOut}
          selectedIdentifier={selectedIdentifier}
          onAddPreset={presetActions.addPreset}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
});

LeftPanel.displayName = 'ConnectorSettingsLeftPanel';

export default LeftPanel;
