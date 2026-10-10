'use client';

import { type McpPresetConnector } from '@orvilo/const';
import { CircleCheck, SquareArrowOutUpRight } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import ConnectorRow from './ConnectorRow';
import { isMcpPresetConnected } from './githubMcpDisplayState';
import { useMcpPresetConnect } from './useMcpPresetConnect';

interface McpPresetItemProps {
  connecting?: boolean;
  /**
   * The custom connector already pointing at this preset's endpoint, when one
   * exists. Linear and GitHub start their respective OAuth flows from the row.
   */
  connector?: ConnectorWithTools;
  isSelected?: boolean;
  onAdd: () => void;
  onSelect: () => void;
  preset: McpPresetConnector;
  providerConnected?: boolean;
  /** A pending authorization attempt hit its deadline — Connect acts as re-check. */
  timedOut?: boolean;
  /**
   * The deployment lacks the managed OAuth path — Connect becomes a PAT
   * "Set up token" entry that opens the preset's credential form.
   */
  tokenSetup?: boolean;
}

/**
 * A row for a curated hosted MCP server (GitHub, Linear, Notion, …) in the
 * Connector settings list. The row always selects; a preset without a connector
 * opens a not-connected detail pane. Linear uses MCP OAuth directly; GitHub reuses the
 * existing GitHub App grant. Other presets retain the custom connector form.
 */
const McpPresetItem = memo<McpPresetItemProps>(
  ({
    preset,
    connector,
    connecting,
    isSelected,
    onAdd,
    onSelect,
    providerConnected,
    timedOut,
    tokenSetup,
  }) => {
    const { t } = useTranslation('setting');
    const currentUserId = useUserStore(userProfileSelectors.userId);
    const { busy, connect, disabled, disabledReason } = useMcpPresetConnect({
      connecting,
      connector,
      onAdd,
      preset,
    });

    const isConnected = isMcpPresetConnected({
      connector,
      currentUserId,
      managedAuth: preset.managedAuth,
      providerConnected,
    });

    const renderAction = () => {
      if (isConnected) {
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex min-w-0">
                  <div className="flex w-5 min-w-0 flex-col items-center justify-center">
                    {createElement(CircleCheck, {
                      size: 16,
                      className: 'text-success',
                    })}
                  </div>
                </span>
              }
            />
            <TooltipContent side="top">
              {t('tools.orviloSkill.connected', { defaultValue: 'Connected' })}
            </TooltipContent>
          </Tooltip>
        );
      }
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex min-w-0">
                <Button
                  disabled={disabled}
                  loading={busy}
                  size="sm"
                  variant="ghost"
                  onClick={connect}
                >
                  {!busy && createElement(SquareArrowOutUpRight)}
                  {timedOut
                    ? t('tools.mcpPreset.checkStatus', 'Check status')
                    : tokenSetup
                      ? t('tools.mcpPreset.tokenSetup', 'Set up token')
                      : t('tools.orviloSkill.connect')}
                </Button>
              </span>
            }
          />
          <TooltipContent side="top">{disabledReason}</TooltipContent>
        </Tooltip>
      );
    };

    const renderIcon = () => {
      const { icon, label } = preset;
      if (typeof icon === 'string') return <Avatar alt={label} avatar={icon} size={18} />;
      return createElement(icon, { fill: 'var(--foreground)', size: 18 });
    };

    return (
      <ConnectorRow
        action={renderAction()}
        active={isSelected}
        icon={renderIcon()}
        muted={!isConnected}
        title={preset.label}
        onSelect={onSelect}
      />
    );
  },
);

McpPresetItem.displayName = 'McpPresetItem';

export default McpPresetItem;
