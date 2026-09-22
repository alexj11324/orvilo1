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
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { getProjectActivityPath } from '@/features/Projects/Layout/navigation';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { ProjectLinks } from '@/features/Projects/Resources/ProjectLinks';
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
import { ProjectDateField, ProjectLeadField, ProjectPriorityField } from './ProjectPlanningFields';
import { PROJECT_STATUS_META } from './ProjectPropertiesCard';

const styles = createStaticStyles(({ css }) => ({
  content: css`
    overflow: auto;
    width: 100%;
  `,
  page: css`
    box-sizing: border-box;
    width: min(800px, calc(100% - 48px));
    margin-inline: auto;
    padding-block: 24px 32px;

    @media (width <= 720px) {
      width: calc(100% - 40px);
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

  const statusMeta = PROJECT_STATUS_META[project.status] ?? PROJECT_STATUS_META.backlog;
  const knowledgeBases = detail.knowledgeBases ?? [];

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
              <Text fontSize={13} style={{ minWidth: 72 }} type={'secondary'} weight={500}>
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
                  color={statusMeta.color}
                  icon={<Icon icon={statusMeta.icon} size={12} />}
                  shape={'round'}
                  size={'small'}
                >
                  {t(`acceptance.status.${project.status}`, {
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
              <Text fontSize={13} style={{ minWidth: 72 }} type={'secondary'} weight={500}>
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
                projectId={project.id}
                onPosted={() => void updatesSWR.mutate()}
                onExpand={() =>
                  navigate(getProjectActivityPath(projectReference), {
                    state: { projectUpdate: true },
                  })
                }
              />
              {(updatesSWR.data ?? [])
                .filter((update) => update.kind !== 'comment')
                .map((update) => (
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
