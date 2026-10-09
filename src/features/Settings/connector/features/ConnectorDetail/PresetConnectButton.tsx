'use client';

import { matchMcpPresetByConnector, type McpPresetConnector } from '@orvilo/const';
import { SquareArrowOutUpRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';

import { type ConnectorPresetActions } from '../useConnectorPresetActions';
import { useMcpPresetConnect } from '../useMcpPresetConnect';
import { visibleMcpPresets } from '../visibleMcpPresets';

interface PresetButtonProps {
  connector?: ConnectorWithTools;
  preset: McpPresetConnector;
  presetActions: ConnectorPresetActions;
}

/** The same Connect action the list row offers, for a pane header. */
export const PresetConnectAction = memo<PresetButtonProps>(
  ({ connector, preset, presetActions }) => {
    const { t } = useTranslation('setting');
    const { busy, connect, disabled } = useMcpPresetConnect({
      connecting: preset.managedAuth === 'github-app' && presetActions.githubConnecting,
      connector,
      onAdd: () => presetActions.addPreset(preset),
      preset,
    });

    return (
      <Button
        aria-busy={busy}
        disabled={disabled}
        loading={busy}
        size="sm"
        variant="outline"
        onClick={connect}
      >
        {!busy && <SquareArrowOutUpRight size={14} />}
        {t('tools.orviloSkill.connect')}
      </Button>
    );
  },
);

PresetConnectAction.displayName = 'PresetConnectAction';

interface PresetConnectButtonProps {
  /** The connector record behind the open pane; the preset is matched from it. */
  connector: ConnectorWithTools;
  presetActions: ConnectorPresetActions;
}

/** Connect entry of a pane whose connector is one of the curated presets; otherwise nothing. */
const PresetConnectButton = memo<PresetConnectButtonProps>(({ connector, presetActions }) => {
  const preset = matchMcpPresetByConnector(connector, visibleMcpPresets);
  return preset ? (
    <PresetConnectAction connector={connector} preset={preset} presetActions={presetActions} />
  ) : null;
});

PresetConnectButton.displayName = 'PresetConnectButton';

export default PresetConnectButton;
