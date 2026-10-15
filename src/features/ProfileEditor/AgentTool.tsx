'use client';

import { getActivePluginIds, upsertPluginMode } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import ActionDropdown from '@/features/ChatInput/ActionBar/components/ActionDropdown';
import ToolItem from '@/features/ChatInput/ActionBar/Tools/ToolItem';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useToolStore } from '@/store/tool';
import { builtinToolSelectors } from '@/store/tool/selectors';

import PluginTag from './PluginTag';
import PopoverContent from './PopoverContent';

export interface AgentToolProps {
  agentId?: string;
  excludeAgentConnectors?: boolean;
  filterAvailableInWeb?: boolean;
  showAuthor?: boolean;
  useAllMetaList?: boolean;
}

const AgentTool = ({ agentId, showAuthor = false, useAllMetaList = false }: AgentToolProps) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const effectiveAgentId = agentId || activeAgentId || '';
  const config = useAgentStore(agentSelectors.getAgentConfigById(effectiveAgentId), isEqual);
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const [open, setOpen] = useState(false);
  const isManualMode = config?.chatConfig?.skillActivateMode === 'manual';
  const tools = useToolStore(
    useAllMetaList
      ? builtinToolSelectors.installedProfileConfigurableMetaList({ isManualMode })
      : builtinToolSelectors.metaList,
    isEqual,
  );
  const plugins = getActivePluginIds(config?.plugins);
  const toggle = async (id: string) => {
    if (!canEdit) return;
    await updateAgentConfigById(effectiveAgentId, {
      plugins: upsertPluginMode(config?.plugins, id, plugins.includes(id) ? 'disabled' : 'pinned'),
    });
  };
  const items = tools.map((tool) => ({
    key: tool.identifier,
    label: (
      <ToolItem
        checked={plugins.includes(tool.identifier)}
        disabled={!canEdit}
        id={tool.identifier}
        label={tool.meta.title}
        onUpdate={() => toggle(tool.identifier)}
      />
    ),
  }));

  return (
    <div className="flex flex-row flex-wrap items-center gap-2">
      <ActionDropdown
        menu={{ items: [] }}
        open={open}
        popupRender={() => <PopoverContent items={items} />}
        trigger="click"
        onOpenChange={(next) => canEdit && setOpen(next)}
      >
        <Button disabled={!canEdit} size="sm" variant="ghost">
          <PlusIcon size={16} />
          {t('tools.title')}
        </Button>
      </ActionDropdown>
      {plugins.map((id) => (
        <PluginTag
          agentId={effectiveAgentId}
          key={id}
          pluginId={id}
          removable={canEdit && tools.some((tool) => tool.identifier === id)}
          showAuthor={showAuthor}
          useAllMetaList={useAllMetaList}
          onRemove={() => toggle(id)}
        />
      ))}
    </div>
  );
};

export default AgentTool;
