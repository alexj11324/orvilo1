'use client';

import { memo } from 'react';

import { type ConnectorPresetActions } from '../useConnectorPresetActions';
import { visibleMcpPresets } from '../visibleMcpPresets';
import NotConnectedDetail from './NotConnectedDetail';
import { PresetConnectAction } from './PresetConnectButton';

interface McpPresetDetailProps {
  presetActions: ConnectorPresetActions;
  presetId: string;
}

/** A curated MCP preset that has no connector yet: name, state and the Connect action. */
const McpPresetDetail = memo<McpPresetDetailProps>(({ presetActions, presetId }) => {
  const preset = visibleMcpPresets.find((candidate) => candidate.id === presetId);
  if (!preset) return null;

  return (
    <NotConnectedDetail
      action={<PresetConnectAction preset={preset} presetActions={presetActions} />}
      description={preset.description}
      title={preset.label}
    />
  );
});

McpPresetDetail.displayName = 'McpPresetDetail';

export default McpPresetDetail;
