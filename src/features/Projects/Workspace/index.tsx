'use client';

import { Center, Flexbox, Icon } from '@lobehub/ui';
import { Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Link2Icon } from 'lucide-react';
import { memo } from 'react';
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
    overflow: auto;
    width: 100%;

    /* Linear parity: the reference's scroll container carries a fixed 48px
       inline padding (measured 245 -> 293 on the reference at two viewports). */
    padding-inline: 48px;

    @media (width <= 720px) {
      padding-inline: 0;
    }
  `,
  page: css`
    box-sizing: border-box;

    /* Linear parity: FLUID, never centred and never a max-width. The reference
       column keeps a constant 11px inset on BOTH edges while the container
       grows (measured: x stays 304 at 1440 and at 1600, only the width moves
       669 -> 829), so the inset is a fixed margin and not margin-inline: auto
       — the previous width: min(800px, calc(100% - 48px)) re-centred the
       column at every width above ~1090 and diverged from the reference there.
       Width stays auto so the block fills the container minus these margins. */
    margin-inline: 11px;
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
}));

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

  const statusVisual = PROJECT_STATUS_VISUALS[resolveProjectStatus(project.status)];
  const knowledgeBases = detail.knowledgeBases ?? [];
  const { emptyState: updatesEmpty, publishedUpdates: projectUpdates } =
    getProjectOverviewUpdateState(updatesSWR.data);

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
              <Text {...SECTION_LABEL_PROPS} style={{ minWidth: 72 }}>
                {t('overview.propertiesLabel', { defaultValue: 'Properties' })}
              </Text>
              <Flexbox
                horizontal
                align={'center'}
                gap={8}
                style={{ minWidth: 0, flex: 1 }}
                wrap={'wrap'}
              >
                <Tag
                  color={statusVisual.color}
                  icon={<Icon icon={statusVisual.icon} size={12} />}
                  shape={'round'}
                  size={'small'}
                >
                  {t(`status.${project.status}`, {
                    defaultValue: project.status,
                  })}
                </Tag>
                {membersEnabled && (
                  <ProjectMembersField projectId={project.id} query={membersSWR} />
                )}
                <ProjectPriorityField project={project} />
                <ProjectLeadField project={project} />
                <ProjectDateField kind="startDate" project={project} />
                <ProjectDateField kind="targetDate" project={project} />
                <Tag shape={'round'} size={'small'}>
                  {t(`properties.visibilityValue.${project.visibility}`, {
                    defaultValue: project.visibility,
                  })}
                </Tag>
              </Flexbox>
            </Flexbox>

            <Flexbox horizontal align={'center'} gap={16}>
              <Text {...SECTION_LABEL_PROPS} style={{ minWidth: 72 }}>
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
