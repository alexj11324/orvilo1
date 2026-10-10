'use client';

import { Grid2x2Plus } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import ConnectorList from './ConnectorList';
import { type ConnectorDetailType } from './connectorSelection';
import { type ConnectorPresetActions } from './useConnectorPresetActions';

interface LeftPanelProps {
  onSelect: (identifier: string, type: ConnectorDetailType) => void;
  presetActions: ConnectorPresetActions;
  selectedIdentifier?: string;
}

const LeftPanel = memo<LeftPanelProps>(({ onSelect, presetActions, selectedIdentifier }) => {
  const { t } = useTranslation('setting');

  return (
    <div className={'flex w-75 min-w-65 flex-col overflow-y-auto border-e border-sidebar-border'}>
      <div
        className={
          'flex h-10.5 shrink-0 items-center justify-between gap-2 border-be border-sidebar-border px-4'
        }
      >
        <span className="text-sm font-semibold">{t('skillView.connectors', 'Connectors')}</span>

        <div className="flex min-w-0 flex-row gap-1.5">
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
            onClick={presetActions.openForm}
          >
            {createElement(Grid2x2Plus)}
          </Button>
        </div>
      </div>

      <div className={'flex-1 overflow-y-auto px-2 py-1'}>
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
