'use client';

import type { ComposioAppType, OrviloSkillProviderType } from '@orvilo/const';
import { getConnectorCatalog } from '@orvilo/const';
import type { BuiltinSkillManifest, OrviloToolMeta } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createBuiltinAgentSkillDetailModal,
  createBuiltinSkillDetailModal,
  createComposioSkillDetailModal,
  createOrviloSkillDetailModal,
} from '@/features/SkillStore/SkillDetail';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useToolStore } from '@/store/tool';
import { type ToolStoreState } from '@/store/tool/initialState';
import { composioStoreSelectors, orviloSkillStoreSelectors } from '@/store/tool/selectors';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

import BuiltinItem from '../Builtin/Item';
import Empty from '../Empty';
import { gridStyles } from '../style';
import WantMoreSkills from '../WantMoreSkills';
import Item from './Item';

interface OrviloListProps {
  keywords: string;
}

// Selector to get only actual builtin tools (not including Composio)
const getBuiltinToolsOnly = (s: ToolStoreState): OrviloToolMeta[] => {
  return s.builtinTools
    .filter((item) => !item.hidden)
    .map((t) => ({
      author: 'Orvilo',
      identifier: t.identifier,
      meta: t.manifest.meta,
      type: 'builtin' as const,
    }));
};

export const OrviloList = memo<OrviloListProps>(({ keywords }) => {
  const { t } = useTranslation('setting');
  const isOrviloSkillEnabled = useServerConfigStore(serverConfigSelectors.enableOrviloSkill);
  const isComposioEnabled = useServerConfigStore(serverConfigSelectors.enableComposio);
  const allOrviloSkillServers = useToolStore(orviloSkillStoreSelectors.getServers, isEqual);
  const allComposioServers = useToolStore(composioStoreSelectors.getServers, isEqual);
  // Use custom selector to get only actual builtin tools (not Composio)
  const builtinTools = useToolStore(getBuiltinToolsOnly, isEqual);
  const builtinSkills = useToolStore((s) => s.builtinSkills, isEqual);

  const [useFetchOrviloSkillConnections, useFetchUserComposioConnections] = useToolStore((s) => [
    s.useFetchOrviloSkillConnections,
    s.useFetchUserComposioConnections,
  ]);

  useFetchOrviloSkillConnections(isOrviloSkillEnabled);
  useFetchUserComposioConnections(isComposioEnabled);

  const getOrviloSkillServerByProvider = useCallback(
    (providerId: string) => {
      return allOrviloSkillServers.find((server) => server.identifier === providerId);
    },
    [allOrviloSkillServers],
  );

  const getComposioServerByIdentifier = useCallback(
    (identifier: string) => {
      return allComposioServers.find((server) => server.identifier === identifier);
    },
    [allComposioServers],
  );

  const filteredItems = useMemo(() => {
    const items: Array<
      | { provider: OrviloSkillProviderType; type: 'orvilo' }
      | { serverType: ComposioAppType; type: 'composio' }
      | { skill: BuiltinSkillManifest; type: 'builtinAgentSkill' }
      | { tool: OrviloToolMeta; type: 'builtin' }
    > = [];

    // Add builtin agent skills first
    for (const skill of builtinSkills) {
      items.push({ skill, type: 'builtinAgentSkill' });
    }

    // Add builtin tools
    for (const tool of builtinTools) {
      items.push({ tool, type: 'builtin' });
    }

    items.push(
      ...getConnectorCatalog({ composio: isComposioEnabled, orvilo: isOrviloSkillEnabled }),
    );

    // Filter by keywords
    const lowerKeywords = keywords.toLowerCase().trim();
    if (!lowerKeywords) return items;

    return items.filter((item) => {
      if (item.type === 'builtinAgentSkill') {
        const name = item.skill.name.toLowerCase();
        const identifier = item.skill.identifier.toLowerCase();
        return name.includes(lowerKeywords) || identifier.includes(lowerKeywords);
      }
      if (item.type === 'builtin') {
        const title = item.tool.meta?.title?.toLowerCase() || '';
        const identifier = item.tool.identifier?.toLowerCase() || '';
        return title.includes(lowerKeywords) || identifier.includes(lowerKeywords);
      }
      const label = item.type === 'orvilo' ? item.provider.label : item.serverType.label;
      return label.toLowerCase().includes(lowerKeywords);
    });
  }, [keywords, isOrviloSkillEnabled, isComposioEnabled, builtinTools, builtinSkills]);

  const hasSearchKeywords = Boolean(keywords && keywords.trim());

  if (filteredItems.length === 0) return <Empty search={hasSearchKeywords} />;

  return (
    <>
      <div className={gridStyles.grid}>
        {filteredItems.map((item) => {
          if (item.type === 'builtinAgentSkill') {
            const localizedTitle = t(`tools.builtins.${item.skill.identifier}.title`, {
              defaultValue: item.skill.name,
            });
            const localizedDescription = t(`tools.builtins.${item.skill.identifier}.description`, {
              defaultValue: item.skill.description,
            });
            return (
              <BuiltinItem
                avatar={item.skill.avatar}
                description={localizedDescription}
                identifier={item.skill.identifier}
                key={item.skill.identifier}
                title={localizedTitle}
                onOpenDetail={() =>
                  createBuiltinAgentSkillDetailModal({ identifier: item.skill.identifier })
                }
              />
            );
          }
          if (item.type === 'builtin') {
            const localizedTitle = t(`tools.builtins.${item.tool.identifier}.title`, {
              defaultValue: item.tool.meta?.title || item.tool.identifier,
            });
            const localizedDescription = t(`tools.builtins.${item.tool.identifier}.description`, {
              defaultValue: item.tool.meta?.description || '',
            });
            return (
              <BuiltinItem
                avatar={item.tool.meta?.avatar}
                description={localizedDescription}
                identifier={item.tool.identifier}
                key={item.tool.identifier}
                title={localizedTitle}
                onOpenDetail={() =>
                  createBuiltinSkillDetailModal({ identifier: item.tool.identifier })
                }
              />
            );
          }
          if (item.type === 'orvilo') {
            const server = getOrviloSkillServerByProvider(item.provider.id);
            const isConnected = server?.status === OrviloSkillStatus.CONNECTED;
            return (
              <Item
                description={item.provider.description}
                icon={item.provider.icon}
                identifier={item.provider.id}
                isConnected={isConnected}
                key={item.provider.id}
                label={item.provider.label}
                type="orvilo"
                onOpenDetail={() => createOrviloSkillDetailModal({ identifier: item.provider.id })}
              />
            );
          }
          const server = getComposioServerByIdentifier(item.serverType.identifier);
          const isConnected = server?.status === ComposioServerStatus.ACTIVE;
          return (
            <Item
              description={item.serverType.description}
              icon={item.serverType.icon}
              identifier={item.serverType.identifier}
              isConnected={isConnected}
              key={item.serverType.identifier}
              label={item.serverType.label}
              serverName={item.serverType.appSlug}
              type="composio"
              onOpenDetail={() =>
                createComposioSkillDetailModal({
                  identifier: item.serverType.identifier,
                  serverName: item.serverType.appSlug,
                })
              }
            />
          );
        })}
      </div>
      <WantMoreSkills />
    </>
  );
});

OrviloList.displayName = 'OrviloList';

export default OrviloList;
