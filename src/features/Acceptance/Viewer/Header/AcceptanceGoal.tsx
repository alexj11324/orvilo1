'use client';

import { ChevronsDownUp, ChevronsUpDown, GitBranch, GitCommitHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';

import { useAcceptanceScope } from '../AcceptanceScope';
import { acceptanceCodingScope } from '../History/codingScope';
import { useAcceptanceBundle } from '../useAcceptanceBundle';

const GOAL_COLLAPSED_STORAGE_KEY = 'orvilo-acceptance-goal-collapsed';

const styles = {
  card: '[&:hover_[data-goal-toggle=true]]:pointer-events-auto [&:hover_[data-goal-toggle=true]]:opacity-100',
  goalToggle:
    'pointer-events-none opacity-0 transition-opacity duration-(--ant-motion-duration-mid) ease-[ease] focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100',
  scopeChip: 'text-[12px] text-muted-foreground',
};

interface AcceptanceGoalProps {
  editSlot?: ReactNode;
}

const AcceptanceGoal = ({ editSlot }: AcceptanceGoalProps) => {
  const { t } = useTranslation('verify');
  const { acceptanceId } = useAcceptanceScope();
  const { data } = useAcceptanceBundle(acceptanceId);
  const [collapsed, setCollapsed] = useLocalStorageState(GOAL_COLLAPSED_STORAGE_KEY, false);
  if (!data) return null;

  const requirement = data.acceptance.requirement;
  const scope = acceptanceCodingScope(data.rounds);
  const emptyLabel = editSlot
    ? t('acceptance.requirementEmptyEditable')
    : t('acceptance.requirementEmpty');

  return (
    <div className={`flex flex-col ${styles.card}`} style={{ gap: collapsed ? 0 : 6 }}>
      {/* No "Acceptance goal" label: the sentence under the title IS the goal,
          and naming it added a caption to a paragraph that reads fine alone.
          Its controls therefore ride the sentence's own row — a header strip
          with nothing left to say is just an empty band of space. */}
      <div className="flex gap-1" style={{ alignItems: collapsed ? 'center' : 'flex-start' }}>
        <div
          className="truncate min-w-0"
          title={collapsed ? (requirement ?? emptyLabel) : undefined}
          style={{
            flex: 1,
            fontSize: collapsed ? 13 : 15,
            lineHeight: collapsed ? undefined : 1.7,
            minWidth: 0,
          }}
        >
          {requirement ?? emptyLabel}
        </div>
        {!collapsed && editSlot}
        <ActionIcon
          data-goal-toggle
          className={styles.goalToggle}
          icon={collapsed ? ChevronsUpDown : ChevronsDownUp}
          size={'small'}
          title={t(collapsed ? 'acceptance.goalExpand' : 'acceptance.goalCollapse')}
          onClick={() => setCollapsed((value) => !value)}
        />
      </div>
      {!collapsed && scope && (
        <div className="flex flex-col gap-2">
          {scope && (
            <div className="flex items-center gap-4 flex-wrap">
              {scope.branch && (
                <div className={`flex items-center gap-1 ${styles.scopeChip}`}>
                  <GitBranch size={13} /> {scope.branch}
                </div>
              )}
              {scope.commit && (
                <div className={`flex items-center gap-1 ${styles.scopeChip}`}>
                  <GitCommitHorizontal size={13} /> {scope.commit.slice(0, 10)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AcceptanceGoal;
