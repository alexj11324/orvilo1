'use client';

import { Center, Flexbox, Icon } from '@lobehub/ui';
import { DropdownMenu, Tag, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowRightIcon, Link2Icon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { getProjectActivityPath } from '@/features/Projects/Layout/navigation';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { ProjectLinks } from '@/features/Projects/Resources/ProjectLinks';
import { SECTION_LABEL_PROPS } from '@/features/Projects/sectionLabel';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import TeamIdentity from '@/features/WorkTeams/TeamIdentity';
import { projectService } from '@/services/project';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import { ProjectUpdateComposer, ProjectUpdateRow, useProjectUpdates } from '../Updates';
import ProjectDashboard from './ProjectDashboard';
import ProjectDescription from './ProjectDescription';
import { ProjectMembersField } from './ProjectMembersField';
import { ProjectOverviewField } from './ProjectOverviewField';
import { getProjectOverviewUpdateState } from './projectOverviewUpdates';
import { ProjectDateField, ProjectLeadField, ProjectPriorityField } from './ProjectPlanningFields';

const styles = createStaticStyles(({ css }) => ({
  content: css`
    scrollbar-width: thin;

    /* Linear parity, read off the reference's own scroll container: a fixed
       48px inline padding plus a thin scrollbar gutter reserved on BOTH edges
       (scrollbar-gutter: stable both-edges; 11px each side here). Those two
       gutters are the "constant 11px inset" measured at 1440 and 1600 — the
       column is fluid, never centred and never capped.

       An earlier version imitated the gutters with an 11px margin on the
       page. That only held while the overview fit the viewport: once it
       scrolled, the real scrollbar took a further 11px and the column shrank
       from 669 to 658. Reserving the gutter keeps it at 669 either way. */
    scrollbar-gutter: stable both-edges;

    overflow: auto;

    width: 100%;
    padding-inline: 48px;

    @media (width <= 720px) {
      scrollbar-gutter: auto;
      padding-inline: 0;
    }
  `,
  page: css`
    box-sizing: border-box;
    padding-block: 24px 32px;

    @media (width <= 720px) {
      margin-inline: 20px;
      padding-block: 20px 48px;
    }
  `,
  shell: css`
    overflow: hidden;
    height: 100%;
    background: ${cssVar.colorBgContainer};
  `,
  properties: css`
    flex: 1;
    gap: 2px 4px;
    min-width: 0;
  `,
  status: css`
    cursor: pointer;

    display: inline-flex;
    gap: 8px;
    align-items: center;

    height: 28px;
    padding-block: 3px;
    padding-inline: 6px;
    border: 0;
    border-radius: 9999px;

    font: inherit;
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }
  `,
  /* The reference's fifth property chip is the project's team: a 28px pill
     carrying the team's accent glyph (14px) and name, and it is a real
     navigation target. Ours links to the team page — the destination this
     codebase already gives a team everywhere else. */
  teamChip: css`
    display: inline-flex;
    gap: 8px;
    align-items: center;

    height: 28px;
    padding-inline: 6px;
    border-radius: 9999px;

    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
    text-decoration: none;

    &:hover {
      text-decoration: none;
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
    }
  `,
}));

const editableStatuses = [
  'backlog',
  'planned',
  'active',
  'paused',
  'canceled',
  'archived',
] as const;

const ProjectWorkspace = memo(() => {
  const { t } = useTranslation('project');
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const enabled = useUserStore(labPreferSelectors.enableProjects);
  const detail = useCurrentProjectDetail(projectId);
  const updateProject = useProjectStore((s) => s.updateProject);
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  const updatesSWR = useProjectUpdates(detail?.project.id);
  const workspaceId = useActiveWorkspaceId();
  const membersEnabled = !!workspaceId;
  const databaseId = detail?.project.id;
  const membersSWR = useProjectMembersQuery(databaseId, membersEnabled && !!databaseId);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (!enabled) return <ProjectDisabled />;
  if (error) return <AsyncError error={error} variant={'page'} onRetry={() => mutate()} />;
  if (isLoading || !detail)
    return (
      <Center height={'100%'}>
        <NeuralNetworkLoading />
      </Center>
    );

  const project = detail.project;
  const projectReference = project.slug ?? projectId!;
  const teams = detail.teams ?? [];

  const statusVisual = PROJECT_STATUS_VISUALS[resolveProjectStatus(project.status)];
  const knowledgeBases = detail.knowledgeBases ?? [];
  const { emptyState: updatesEmpty, publishedUpdates: projectUpdates } =
    getProjectOverviewUpdateState(updatesSWR.data);
  const changeStatus = async (status: (typeof editableStatuses)[number]) => {
    if (updatingStatus || status === project.status) return;
    setUpdatingStatus(true);
    try {
      await projectService.updateStatus(project.id, status);
      await mutate();
    } catch (error) {
      console.error('Failed to update project status', error);
      toast.error(t('properties.saveError'));
    } finally {
      setUpdatingStatus(false);
    }
  };
  const lifecycleLocked =
    project.status === 'reviewing' ||
    (project.status === 'archived' && !!project.completedReviewId);
  const availableStatuses =
    project.status === 'completed' || project.completedReviewId
      ? editableStatuses.filter((status) => status === 'archived')
      : editableStatuses;
  const statusItems = availableStatuses.map((status) => ({
    icon: <Icon icon={PROJECT_STATUS_VISUALS[status].icon} size={16} />,
    key: status,
    label: t(`status.${status}`),
    onClick: () => void changeStatus(status),
  }));

  return (
    <Flexbox className={styles.shell} flex={1}>
      <div className={styles.content}>
        <Flexbox className={styles.page} gap={0}>
          <Flexbox gap={20}>
            <Flexbox gap={10}>
              <Avatar
                avatar={project.avatar || undefined}
                name={project.name}
                shape={'square'}
                size={44}
                title={project.name}
              />
              <Flexbox gap={2}>
                <ProjectOverviewField
                  key={`${project.id}:name`}
                  kind="name"
                  value={project.name}
                  onSave={(name) => updateProject(project.id, { name })}
                />
                <ProjectOverviewField
                  key={`${project.id}:summary`}
                  kind="summary"
                  value={project.summary ?? ''}
                  onSave={(summary) => updateProject(project.id, { summary })}
                />
              </Flexbox>
            </Flexbox>

            <Flexbox horizontal align={'center'} gap={16}>
              {/* Label column: the reference sizes one shared grid column by
                  the widest label — "Resources" at 65.4766px (≈65.5). */}
              <Text {...SECTION_LABEL_PROPS} style={{ minWidth: 65.5 }}>
                {t('overview.propertiesLabel', { defaultValue: 'Properties' })}
              </Text>
              <Flexbox horizontal align={'center'} className={styles.properties} wrap={'wrap'}>
                <DropdownMenu items={statusItems}>
                  <button
                    aria-label={t('properties.status')}
                    className={styles.status}
                    disabled={updatingStatus || lifecycleLocked}
                    type="button"
                  >
                    <Icon color={statusVisual.color} icon={statusVisual.icon} size={16} />
                    {t(`status.${project.status}`, { defaultValue: project.status })}
                  </button>
                </DropdownMenu>
                <ProjectPriorityField inline project={project} />
                <ProjectLeadField inline project={project} />
                <ProjectDateField inline kind="startDate" project={project} />
                <Icon aria-hidden icon={ArrowRightIcon} size={16} />
                <ProjectDateField inline kind="targetDate" project={project} />
                {teams.map((team) => (
                  <WorkspaceLink className={styles.teamChip} key={team.id} to={`/teams/${team.id}`}>
                    <TeamIdentity
                      color={team.color}
                      id={team.id}
                      letter={(team.key || team.name).slice(0, 1)}
                      size={14}
                    />
                    {team.name}
                  </WorkspaceLink>
                ))}
                {membersEnabled && (
                  <ProjectMembersField projectId={project.id} query={membersSWR} />
                )}
              </Flexbox>
            </Flexbox>

            <Flexbox horizontal align={'center'} gap={16}>
              <Text {...SECTION_LABEL_PROPS} style={{ minWidth: 65.5 }}>
                {t('overview.resourcesLabel', { defaultValue: 'Resources' })}
              </Text>
              <Flexbox horizontal align={'center'} gap={8} wrap={'wrap'}>
                {knowledgeBases.map((link) => (
                  <Tag
                    icon={<Icon icon={Link2Icon} size={12} />}
                    key={link.knowledgeBase.id}
                    shape={'round'}
                    size={'small'}
                  >
                    {link.knowledgeBase.name}
                  </Tag>
                ))}
                <ProjectLinks ownerId={project.userId} projectId={project.id} />
              </Flexbox>
            </Flexbox>

            <Flexbox gap={8}>
              <ProjectUpdateComposer
                emptyState={updatesEmpty}
                projectId={project.id}
                onPosted={() => void updatesSWR.mutate()}
                onExpand={() =>
                  navigate(getProjectActivityPath(projectReference), {
                    state: { projectUpdate: true },
                  })
                }
              />
              {/* A failed updates fetch must not read as a confident "no
                  updates yet" — inline failure marker with retry. */}
              {updatesSWR.error ? (
                <AsyncError
                  error={updatesSWR.error}
                  variant={'inline'}
                  onRetry={() => void updatesSWR.mutate()}
                />
              ) : null}
              {projectUpdates.map((update) => (
                <ProjectUpdateRow key={update.id} update={update} />
              ))}
            </Flexbox>
            <ProjectDescription
              description={project.description}
              key={project.id}
              projectId={project.id}
              onSaved={() => void mutate()}
            />
          </Flexbox>
          <ProjectDashboard detail={detail} projectId={project.id} />
        </Flexbox>
      </div>
    </Flexbox>
  );
});

ProjectWorkspace.displayName = 'ProjectWorkspace';

export default ProjectWorkspace;
