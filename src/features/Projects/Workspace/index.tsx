'use client';

import { Center, Flexbox, Icon } from '@lobehub/ui';
import { Button, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { CalendarIcon, Link2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { getProjectResourcesPath } from '@/features/Projects/Layout/navigation';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { useTeammatesEnabled } from '@/features/Teammates/useTeammatesEnabled';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import { ProjectUpdateComposer, ProjectUpdateRow, useProjectUpdates } from '../Updates';
import ProjectDashboard from './ProjectDashboard';
import ProjectDescription from './ProjectDescription';
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
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  const updatesSWR = useProjectUpdates(detail?.project.id);
  const workspaceId = useActiveWorkspaceId();
  const membersEnabled = useTeammatesEnabled() && !!workspaceId;
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
  const members = membersSWR.data ?? [];
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
                <Text fontSize={22} weight={650}>
                  {project.name}
                </Text>
                {project.summary || project.description ? (
                  <Text fontSize={14} type={'secondary'}>
                    {project.summary || project.description}
                  </Text>
                ) : null}
              </Flexbox>
            </Flexbox>

            <Flexbox horizontal align={'center'} gap={16}>
              <Text fontSize={12} style={{ minWidth: 72 }} type={'secondary'}>
                {t('overview.propertiesLabel', { defaultValue: 'Properties' })}
              </Text>
              <Flexbox horizontal align={'center'} gap={8} wrap={'wrap'}>
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
                {membersEnabled &&
                  (members.length > 0 ? (
                    <Flexbox horizontal align={'center'} gap={4}>
                      {members.slice(0, 4).map((member) => (
                        <Avatar
                          avatar={member.user?.avatar ?? undefined}
                          key={member.userId}
                          size={18}
                          title={member.user?.fullName || member.user?.username || undefined}
                        />
                      ))}
                      {members.length > 4 && (
                        <Text fontSize={12} type={'secondary'}>
                          +{members.length - 4}
                        </Text>
                      )}
                    </Flexbox>
                  ) : (
                    <Text fontSize={13} type={'secondary'}>
                      {t('properties.membersEmpty', { defaultValue: 'Add members' })}
                    </Text>
                  ))}
                {project.createdAt && (
                  <Tag icon={<Icon icon={CalendarIcon} size={12} />} shape={'round'} size={'small'}>
                    {dayjs(project.createdAt).format('MMM D')}
                  </Tag>
                )}
                <Tag shape={'round'} size={'small'}>
                  {t(`properties.visibilityValue.${project.visibility}`, {
                    defaultValue: project.visibility,
                  })}
                </Tag>
              </Flexbox>
            </Flexbox>

            <Flexbox horizontal align={'center'} gap={16}>
              <Text fontSize={12} style={{ minWidth: 72 }} type={'secondary'}>
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
                <Button
                  icon={Link2Icon}
                  size={'small'}
                  type={'text'}
                  onClick={() => navigate(getProjectResourcesPath(projectReference))}
                >
                  {t('overview.resourcesAdd', {
                    defaultValue: 'Add document or link…',
                  })}
                </Button>
              </Flexbox>
            </Flexbox>

            <Flexbox gap={8}>
              <ProjectUpdateComposer
                projectId={project.id}
                onPosted={() => void updatesSWR.mutate()}
              />
              {(updatesSWR.data ?? []).map((update) => (
                <ProjectUpdateRow key={update.id} update={update} />
              ))}
            </Flexbox>
            <ProjectDescription
              description={project.description}
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
