import { createModal } from '@lobehub/ui/base-ui';
import isEqual from 'fast-deep-equal';
import { t as translate } from 'i18next';
import { EyeIcon } from 'lucide-react';
import type React from 'react';
import { lazy, memo, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { startSkillDrag } from '@/features/ChatInput/InputEditor/ActionTag/skillDragData';
import {
  type SkillListItem,
  type SkillRowAction,
  SkillSection,
  SkillsList,
} from '@/features/SkillsList';
import { useToolStore } from '@/store/tool';
import { agentSkillsSelectors } from '@/store/tool/selectors';

const AgentSkillDetail = lazy(() => import('@/features/AgentSkillDetail'));

const EMPTY_ITEMS: SkillListItem[] = [];

const handleSkillDragStart = (item: SkillListItem, event: React.DragEvent) => {
  startSkillDrag(event, {
    category: 'skill',
    label: item.name,
    type: item.id,
  });
};

const openSkillDetailModal = (skillId: string) =>
  createModal({
    content: (
      <Suspense fallback={<div style={{ height: '100%' }} />}>
        <AgentSkillDetail skillId={skillId} />
      </Suspense>
    ),
    footer: null,
    styles: { content: { height: 'calc(100dvh - 200px)', overflow: 'hidden', padding: 0 } },
    title: translate('workingPanel.skills.detail.title', { ns: 'chat' }),
    width: 960,
  });

/**
 * Reads the skills already attached to the account (entries in the
 * `agent_skill` table) into the `SkillsList` row shape. Builtin tools and
 * Orvilo MCP servers are intentionally excluded — those belong in the Tools
 * popover, not in the per-user skill inventory.
 *
 * Also triggers the underlying SWR fetch so the working sidebar surfaces the
 * data even when the Tools popover hasn't been opened in this session. The key
 * is deduplicated, so co-mounting with `useControls` doesn't double-fetch.
 */
export const useUserSkills = (enabled = true): SkillListItem[] => {
  useToolStore((s) => s.useFetchAgentSkills)(enabled);
  const agentSkills = useToolStore(agentSkillsSelectors.getAgentSkills, isEqual);

  return useMemo(
    () =>
      !enabled
        ? EMPTY_ITEMS
        : agentSkills.map((skill) => ({
            description: skill.description ?? undefined,
            // `identifier` is what the runtime resolves through the skill registry,
            // and is unique per skill — reuse it as both the React key and the
            // drag payload's `type`.
            id: skill.identifier,
            name: skill.name,
          })),
    [agentSkills, enabled],
  );
};

interface UserLevelSkillsProps {
  /**
   * Skip the `SkillSection` wrapper (no header row). Set when the parent has
   * collapsed to a single visible source and wants the list rendered flat,
   * matching the agent-only layout this used to ship with.
   */
  hideHeader?: boolean;
}

const UserLevelSkills = memo<UserLevelSkillsProps>(({ hideHeader }) => {
  const { t } = useTranslation('chat');

  const items = useUserSkills();
  const agentSkills = useToolStore(agentSkillsSelectors.getAgentSkills, isEqual);

  // Read-only inventory. Renaming and deleting platform skills went with the
  // retired Skill-management chain, so the only actions left are opening the
  // skill and dragging it into the composer.
  const getRowActions = useCallback(
    (item: SkillListItem): SkillRowAction[] => {
      const skill = agentSkills.find((s) => s.identifier === item.id);
      if (!skill) return [];

      return [
        {
          icon: EyeIcon,
          key: 'view',
          label: t('workingPanel.skills.actions.view'),
          onClick: () => openSkillDetailModal(skill.id),
          sfSymbol: 'eye',
        },
      ];
    },
    [agentSkills, t],
  );

  const onOpenSkill = useCallback(
    (item: SkillListItem) => {
      const skill = agentSkills.find((s) => s.identifier === item.id);
      if (skill) openSkillDetailModal(skill.id);
    },
    [agentSkills],
  );

  if (items.length === 0) return null;

  const list = (
    <SkillsList
      getRowActions={getRowActions}
      items={items}
      onOpenSkill={onOpenSkill}
      onSkillDragStart={handleSkillDragStart}
    />
  );

  if (hideHeader) return list;

  return (
    <SkillSection
      sectionHeader={{
        count: items.length,
        title: t('workingPanel.skills.section.user'),
      }}
    >
      {list}
    </SkillSection>
  );
});

UserLevelSkills.displayName = 'UserLevelSkills';

export default UserLevelSkills;
