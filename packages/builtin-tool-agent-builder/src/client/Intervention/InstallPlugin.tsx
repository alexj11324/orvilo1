'use client';

import { Avatar } from '@lobehub/ui/base-ui';
import { resolveConnectorCatalogItem } from '@orvilo/const';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { CheckCircle } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useToolStore } from '@/store/tool';
import {
  composioStoreSelectors,
  orviloSkillStoreSelectors,
  pluginSelectors,
} from '@/store/tool/selectors';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore/types';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import type { InstallPluginParams } from '../../types';

/**
 * InstallPlugin Intervention Component
 *
 * This component only renders the UI for user confirmation.
 * The actual OAuth flow and installation logic is handled in ExecutionRuntime.installPlugin()
 * which runs after the user approves the intervention.
 */
const InstallPluginIntervention = memo<BuiltinInterventionProps<InstallPluginParams>>(
  ({ args }) => {
    const { identifier, source } = args;
    const { t } = useTranslation('chat');
    const isComposioEnabled = useServerConfigStore(serverConfigSelectors.enableComposio);
    const isOrviloSkillEnabled = useServerConfigStore(serverConfigSelectors.enableOrviloSkill);

    // Tool store selectors
    const isPluginInstalled = useToolStore((s) => pluginSelectors.isPluginInstalled(identifier)(s));

    // Get Composio server state
    const composioServer = useToolStore((s) =>
      composioStoreSelectors.getServers(s).find((srv) => srv.identifier === identifier),
    );

    // Get OrviloSkill server state
    const orviloSkillServer = useToolStore((s) =>
      orviloSkillStoreSelectors.getServers(s).find((srv) => srv.identifier === identifier),
    );

    // Get Builtin tool info
    const builtinTool = useToolStore((s) =>
      s.builtinTools.find((tool) => tool.identifier === identifier),
    );

    const connector = resolveConnectorCatalogItem(identifier, {
      composio: isComposioEnabled,
      orvilo: isOrviloSkillEnabled,
    });
    const composioAppInfo = connector?.type === 'composio' ? connector.serverType : undefined;
    const isComposio = source === 'official' && !!composioAppInfo;

    const orviloSkillProviderInfo = connector?.type === 'orvilo' ? connector.provider : undefined;
    const isOrviloSkill = source === 'official' && !!orviloSkillProviderInfo;

    // Render success state (already installed)
    if (isPluginInstalled) {
      return (
        <div
          className="flex items-center gap-3"
          style={{ background: 'var(--lobe-fill-tertiary)', borderRadius: 8, padding: 16 }}
        >
          <CheckCircle size={20} style={{ color: 'var(--lobe-success-6)' }} />
          <div className="flex flex-col gap-1">
            <span style={{ fontWeight: 600 }}>
              {isComposio || isOrviloSkill
                ? t('agentBuilder.installPlugin.connectedAndEnabled')
                : t('agentBuilder.installPlugin.installedAndEnabled')}
            </span>
            <span style={{ color: 'var(--lobe-text-secondary)', fontSize: 12 }}>
              {composioAppInfo?.label || orviloSkillProviderInfo?.label || identifier}
            </span>
          </div>
        </div>
      );
    }

    // Render Composio tool
    if (isComposio) {
      const icon = typeof composioAppInfo?.icon === 'string' ? composioAppInfo.icon : undefined;
      const isPendingAuth = composioServer?.status === ComposioServerStatus.PENDING_AUTH;

      return (
        <div
          className="flex flex-col gap-3"
          style={{ background: 'var(--lobe-fill-tertiary)', borderRadius: 8, padding: 16 }}
        >
          <div className="flex items-center gap-3">
            {icon ? (
              <img
                alt={composioAppInfo?.label || identifier}
                height={40}
                src={icon}
                style={{ borderRadius: 8 }}
                width={40}
              />
            ) : (
              <Avatar avatar="☁️" size={40} style={{ borderRadius: 8 }} />
            )}
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 600 }}>{composioAppInfo?.label || identifier}</span>
                <span style={{ color: 'var(--lobe-text-tertiary)', fontSize: 12 }}>Composio</span>
              </div>
              <span style={{ color: 'var(--lobe-text-secondary)', fontSize: 12 }}>
                {isPendingAuth
                  ? t('agentBuilder.installPlugin.requiresAuth')
                  : t('agentBuilder.installPlugin.clickApproveToConnect')}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Render OrviloSkill provider
    if (isOrviloSkill) {
      const icon =
        typeof orviloSkillProviderInfo?.icon === 'string'
          ? orviloSkillProviderInfo.icon
          : undefined;
      const isNotConnected =
        !orviloSkillServer || orviloSkillServer.status !== OrviloSkillStatus.CONNECTED;

      return (
        <div
          className="flex flex-col gap-3"
          style={{ background: 'var(--lobe-fill-tertiary)', borderRadius: 8, padding: 16 }}
        >
          <div className="flex items-center gap-3">
            {icon ? (
              <img
                alt={orviloSkillProviderInfo?.label || identifier}
                height={40}
                src={icon}
                style={{ borderRadius: 8 }}
                width={40}
              />
            ) : (
              <Avatar avatar="🔗" size={40} style={{ borderRadius: 8 }} />
            )}
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 600 }}>
                  {orviloSkillProviderInfo?.label || identifier}
                </span>
                <span style={{ color: 'var(--lobe-text-tertiary)', fontSize: 12 }}>
                  Orvilo Skill
                </span>
              </div>
              <span style={{ color: 'var(--lobe-text-secondary)', fontSize: 12 }}>
                {isNotConnected
                  ? t('agentBuilder.installPlugin.requiresAuth')
                  : t('agentBuilder.installPlugin.clickApproveToConnect')}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Render MCP marketplace plugin or Builtin tool
    // Note: The actual installation happens in ExecutionRuntime after user approves
    const pluginName = builtinTool?.manifest?.meta?.title || identifier;
    const pluginIcon = builtinTool?.manifest?.meta?.avatar;
    const pluginType = source === 'market' ? 'MCP Plugin' : 'Builtin Tool';

    return (
      <div
        className="flex flex-col gap-3"
        style={{ background: 'var(--lobe-fill-tertiary)', borderRadius: 8, padding: 16 }}
      >
        <div className="flex items-center gap-3">
          {pluginIcon && typeof pluginIcon === 'string' && pluginIcon.startsWith('http') ? (
            <img
              alt={pluginName}
              height={40}
              src={pluginIcon}
              style={{ borderRadius: 8 }}
              width={40}
            />
          ) : (
            <Avatar avatar={pluginIcon || '🔧'} size={40} style={{ borderRadius: 8 }} />
          )}
          <div className="flex flex-col flex-1 gap-1">
            <div className="flex items-center gap-2">
              <span style={{ fontWeight: 600 }}>{pluginName}</span>
              <span style={{ color: 'var(--lobe-text-tertiary)', fontSize: 12 }}>{pluginType}</span>
            </div>
            <span style={{ color: 'var(--lobe-text-secondary)', fontSize: 12 }}>
              {t('agentBuilder.installPlugin.clickApproveToInstall')}
            </span>
          </div>
        </div>
      </div>
    );
  },
);

export default InstallPluginIntervention;
