'use client';

import type { TeamItem, TeamMemberItem } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';

import { useSearchParams } from '@/libs/router/navigation';

import { useWorkspaceMembersQuery } from '../Teammates/api/hooks';
import TeamHomeDocuments from './home/TeamHomeDocuments';
import TeamHomeMembers from './home/TeamHomeMembers';
import { resolveTeamHomeMembers } from './home/teamHomeMembersModel';
import TeamHomeOverview from './home/TeamHomeOverview';
import { resolveTeamHomeSection } from './home/teamHomeSection';
import TeamHomeTabs from './home/TeamHomeTabs';

const styles = createStaticStyles(({ css }) => ({
  page: css`
    width: 100%;

    @container work-surface (max-width: 1000px) {
      width: 100%;
    }
  `,
  sectionBody: css`
    width: min(972px, 100%);
    margin-block-start: 8px;
    margin-inline: auto;
  `,
}));

interface TeamHomeProps {
  teamData: {
    members: TeamMemberItem[];
    team: TeamItem;
  };
  teamId: string;
  triageCapable: boolean;
  workspaceSlug: string;
}

/**
 * Team Home (`?tab=home`) — Linear's Overview / Documents / Members sub-tabs
 * rendered inside the home surface. `section` is a query param so every
 * sub-tab keeps a distinct, back-navigable URL; the workspace members query
 * is shared by the overview rail and the Members tab (SWR dedupes, but one
 * resolution keeps both views consistent).
 */
const TeamHome = ({ teamData, teamId, triageCapable, workspaceSlug }: TeamHomeProps) => {
  const [searchParams] = useSearchParams();
  const section = resolveTeamHomeSection(searchParams.get('section'));
  const membersQuery = useWorkspaceMembersQuery({ enabled: true });
  const members = resolveTeamHomeMembers(teamData.members, membersQuery.members ?? []);

  return (
    <div className={styles.page}>
      <TeamHomeTabs active={section} searchParams={searchParams} teamId={teamId} />
      <div className={styles.sectionBody}>
        {section === 'overview' ? (
          <TeamHomeOverview
            members={members}
            membersError={membersQuery.error}
            membersLoading={membersQuery.isLoading}
            team={teamData.team}
            teamId={teamId}
            triageCapable={triageCapable}
            workspaceSlug={workspaceSlug}
            onMembersRetry={() => void membersQuery.mutate()}
          />
        ) : null}
        {section === 'documents' ? <TeamHomeDocuments teamId={teamId} /> : null}
        {section === 'members' ? (
          <TeamHomeMembers
            error={membersQuery.error}
            isLoading={membersQuery.isLoading}
            members={members}
            onRetry={() => void membersQuery.mutate()}
          />
        ) : null}
      </div>
    </div>
  );
};

export default TeamHome;
