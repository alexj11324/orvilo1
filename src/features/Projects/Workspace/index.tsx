'use client';
import { cn } from 'cn';
import { ArrowRightIcon, Link2Icon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { getProjectActivityPath } from '@/features/Projects/Layout/navigation';
import { projectIssueProgressPercent } from '@/features/Projects/projectIssueProgress';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import { ProjectLinks } from '@/features/Projects/Resources/ProjectLinks';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import TeamIdentity from '@/features/WorkTeams/TeamIdentity';
import { projectService } from '@/services/project';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';

import {
  ProjectUpdateComposer,
  ProjectUpdateRow,
  useCanModerateProjectUpdate,
  useProjectUpdates,
} from '../Updates';
import ProjectDashboard from './ProjectDashboard';
import ProjectDescription from './ProjectDescription';
import { ProjectMembersField } from './ProjectMembersField';
import { ProjectOverviewField } from './ProjectOverviewField';
import { getProjectOverviewUpdateState } from './projectOverviewUpdates';
import { ProjectDateField, ProjectLeadField, ProjectPriorityField } from './ProjectPlanningFields';
import { PROPERTY_CONTROL_CLASS } from './propertyControl';

const styles = {
  content:
    '[scrollbar-width:thin] [scrollbar-gutter:stable_both-edges] overflow-auto w-full px-12 [@media(width<=720px)]:[scrollbar-gutter:auto] [@media(width<=720px)]:px-0',
  page: 'box-border pt-18 pb-8 [@media(width<=720px)]:mx-5 [@media(width<=720px)]:pt-5 [@media(width<=720px)]:pb-12',
  shell: 'h-full overflow-hidden bg-card',
  properties: 'min-w-0 flex-1 gap-x-1 gap-y-0.5',
};

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
  const detail = useCurrentProjectDetail(projectId);
  const updateProject = useProjectStore((s) => s.updateProject);
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  const updatesSWR = useProjectUpdates(detail?.project.id);
  const canModerateUpdate = useCanModerateProjectUpdate(detail?.project);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const workspaceId = useActiveWorkspaceId();
  const membersEnabled = !!workspaceId;
  const databaseId = detail?.project.id;
  const membersSWR = useProjectMembersQuery(databaseId, membersEnabled && !!databaseId);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (error) return <AsyncError error={error} variant={'page'} onRetry={() => mutate()} />;
  if (isLoading || !detail)
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <NeuralNetworkLoading />
      </div>
    );

  const project = detail.project;
  const projectReference = project.slug ?? projectId!;
  const teams = detail.teams ?? [];

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
    icon: <ProjectStatusIcon size={16} status={status} />,
    key: status,
    label: t(`status.${status}`),
    onClick: () => void changeStatus(status),
  }));

  return (
    <div className={cn(cn('flex flex-col', styles.shell), 'flex-1')}>
      <div className={styles.content}>
        <div className={cn(cn('flex flex-col', styles.page), 'gap-0')}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <Avatar
                avatar={project.avatar || undefined}
                name={project.name}
                shape={'square'}
                size={44}
                title={project.name}
              />
              <div className="flex flex-col gap-0.5">
                <ProjectOverviewField
                  canEdit={detail.capabilities?.canEdit}
                  key={`${project.id}:name`}
                  kind="name"
                  value={project.name}
                  onSave={(name) => updateProject(project.id, { name })}
                />
                <ProjectOverviewField
                  canEdit={detail.capabilities?.canEdit}
                  key={`${project.id}:summary`}
                  kind="summary"
                  value={project.summary ?? ''}
                  onSave={(summary) => updateProject(project.id, { summary })}
                />
              </div>
            </div>
            <div className="flex flex-row items-center gap-4">
              {/* Shared metadata label column follows the 72px spacing rhythm. */}
              <span className="text-muted-foreground text-xs leading-5 font-medium min-w-18">
                {t('overview.propertiesLabel', { defaultValue: 'Properties' })}
              </span>
              <div className={cn(cn('flex flex-row', styles.properties), 'items-center flex-wrap')}>
                <DropdownMenu items={statusItems}>
                  <Button
                    aria-label={t('properties.status')}
                    className={PROPERTY_CONTROL_CLASS}
                    disabled={updatingStatus || lifecycleLocked || !detail.capabilities?.canEdit}
                    size="sm"
                    variant="ghost"
                  >
                    <ProjectStatusIcon
                      percent={projectIssueProgressPercent(detail.tasks) ?? 0}
                      size={16}
                      status={project.status}
                    />
                    {t(`status.${project.status}`, { defaultValue: project.status })}
                  </Button>
                </DropdownMenu>
                <ProjectPriorityField inline project={project} />
                <ProjectLeadField inline project={project} />
                <ProjectDateField kind="startDate" project={project} />
                <ArrowRightIcon aria-hidden size={16} />
                <ProjectDateField kind="targetDate" project={project} />
                {teams.map((team) => (
                  <WorkspaceLink
                    className="group/project-team inline-flex min-w-0 rounded-(--radius-input) focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                    key={team.id}
                    to={`/teams/${team.id}`}
                  >
                    <span className="inline-flex h-7 max-w-full shrink-0 items-center gap-2 rounded-(--radius-input) px-1.5 py-0 text-sm leading-5.5 font-medium text-foreground group-hover/project-team:bg-accent group-focus-visible/project-team:bg-accent">
                      <TeamIdentity
                        color={team.color}
                        id={team.id}
                        letter={(team.key || team.name).slice(0, 1)}
                        size={14}
                      />
                      {team.name}
                    </span>
                  </WorkspaceLink>
                ))}
                {membersEnabled && (
                  <ProjectMembersField
                    canManage={detail.capabilities?.canManage}
                    projectId={project.id}
                    projectVisibility={project.visibility}
                    query={membersSWR}
                    onChanged={() => mutate()}
                  />
                )}
              </div>
            </div>
            <div className="flex flex-row items-center gap-4">
              <span className="text-muted-foreground text-xs leading-5 font-medium min-w-18">
                {t('overview.resourcesLabel', { defaultValue: 'Resources' })}
              </span>
              <div className="flex flex-row items-center gap-2 flex-wrap">
                {knowledgeBases.map((link) => (
                  <Badge
                    className="h-auto leading-5"
                    key={link.knowledgeBase.id}
                    radius="full"
                    size="default"
                    variant="secondary"
                  >
                    <Link2Icon size={12} />
                    {link.knowledgeBase.name}
                  </Badge>
                ))}
                <ProjectLinks ownerId={project.userId} projectId={project.id} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <ProjectUpdateComposer
                emptyState={updatesEmpty}
                key={project.id}
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
              {projectUpdates.map((update) =>
                editingUpdateId === update.id ? (
                  <ProjectUpdateComposer
                    editingUpdate={update}
                    key={update.id}
                    projectId={project.id}
                    onCancelEdit={() => setEditingUpdateId(null)}
                    onPosted={() => {
                      setEditingUpdateId(null);
                      void updatesSWR.mutate();
                    }}
                  />
                ) : (
                  <ProjectUpdateRow
                    {...canModerateUpdate(update)}
                    key={update.id}
                    update={update}
                    onChanged={() => void updatesSWR.mutate()}
                    onEdit={() => setEditingUpdateId(update.id)}
                  />
                ),
              )}
            </div>
            <ProjectDescription
              canEdit={detail.capabilities?.canEdit}
              description={project.description}
              key={project.id}
              projectId={project.id}
              onSaved={() => void mutate()}
            />
          </div>
          <ProjectDashboard detail={detail} projectId={project.id} />
        </div>
      </div>
    </div>
  );
});

ProjectWorkspace.displayName = 'ProjectWorkspace';

export default ProjectWorkspace;
