import { SkillsIcon } from '@lobehub/ui/icons';
import { type AgentPluginMode, getDisabledPluginIds } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import Select from '@/components/Select';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import {
  agentByIdSelectors,
  agentSelectors,
  chatConfigByIdSelectors,
} from '@/store/agent/selectors';
import { useToolStore } from '@/store/tool';
import { builtinToolSelectors } from '@/store/tool/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import type { ActionMenuItem } from '../../menuItems';
import ToolItemDetailPopover from './ToolItemDetailPopover';

export const useControls = () => {
  const { t } = useTranslation('setting');
  const agentId = useAgentId();
  const { allowed: canEdit } = usePermission('edit_own_content');
  const isManualMode = useAgentStore(
    (s) => chatConfigByIdSelectors.getSkillActivateModeById(agentId)(s) === 'manual',
  );
  const config = useAgentStore((s) => agentSelectors.getAgentConfigById(agentId)(s));
  const pinned = useAgentStore((s) => agentByIdSelectors.getAgentPluginsById(agentId)(s));
  const disabled = getDisabledPluginIds(config?.plugins);
  const setPluginMode = useAgentStore((s) => s.setPluginMode);
  const tools = useToolStore(
    isManualMode ? builtinToolSelectors.metaListIncludingHidden : builtinToolSelectors.metaList,
    isEqual,
  );
  const fixedTools = useToolStore(
    builtinToolSelectors.fixedDisplayMetaList({ isManualMode }),
    isEqual,
  );
  const fixedIds = new Set(fixedTools.map((tool) => tool.identifier));
  const allTools = [...fixedTools, ...tools.filter((tool) => !fixedIds.has(tool.identifier))];
  const modeFor = (id: string): AgentPluginMode =>
    disabled.includes(id)
      ? 'disabled'
      : fixedIds.has(id) || pinned.includes(id)
        ? 'pinned'
        : 'auto';
  const marketItems: ActionMenuItem[] = allTools.map((tool) => {
    const title = t(`tools.builtins.${tool.identifier}.title`, {
      defaultValue: tool.meta.title || tool.identifier,
    });
    return {
      icon: tool.meta.avatar ? (
        <Avatar avatar={tool.meta.avatar} shape="square" size={16} />
      ) : (
        <SkillsIcon size={16} />
      ),
      key: tool.identifier,
      label: (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate text-sm">{title}</span>
          <Select<AgentPluginMode>
            aria-label={title}
            disabled={!canEdit}
            size="small"
            value={modeFor(tool.identifier)}
            options={(fixedIds.has(tool.identifier)
              ? (['pinned', 'disabled'] as const)
              : (['pinned', 'auto', 'disabled'] as const)
            ).map((value) => ({ label: t(`tools.activation.${value}`), value }))}
            onChange={async (mode) => {
              if (canEdit && mode && !Array.isArray(mode)) {
                await setPluginMode(tool.identifier, mode, agentId);
              }
            }}
          />
        </div>
      ),
      popoverContent: (
        <ToolItemDetailPopover
          description={tool.meta.description}
          identifier={tool.identifier}
          sourceLabel="Orvilo"
          title={title}
        />
      ),
    };
  });
  return {
    autoCount: allTools.filter((tool) => modeFor(tool.identifier) === 'auto').length,
    isPolicyMenuOpen: false,
    marketItems,
    pinnedCount: allTools.filter((tool) => modeFor(tool.identifier) === 'pinned').length,
  };
};
