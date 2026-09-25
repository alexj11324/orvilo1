import { Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { agentDisplayName } from '@orvilo/types';
import { Breadcrumb as AntBreadcrumb } from 'antd';
import { ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import Avatar from '@/components/Avatar';
import { projectAvatar } from '@/features/Projects/ProjectIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useClientDataSWR } from '@/libs/swr';
import { projectService } from '@/services/project';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';

import { styles } from './style';
import { useAgentDisplayMeta } from './useAgentDisplayMeta';

interface BreadcrumbProps {
  taskId?: string;
}

const Breadcrumb = memo<BreadcrumbProps>(({ taskId }) => {
  const { t } = useTranslation('chat');
  const { aid } = useParams<{ aid?: string }>();
  const agentMeta = useAgentDisplayMeta(aid);
  const taskTitle = useTaskStore((s) => (taskId ? s.taskDetailMap[taskId]?.name : undefined));
  const taskIdentifier = useTaskStore((s) =>
    taskId ? s.taskDetailMap[taskId]?.identifier : undefined,
  );
  const taskProjectId = useTaskStore((s) =>
    taskId ? s.taskDetailMap[taskId]?.projectId : undefined,
  );
  const taskTeamId = useTaskStore((s) => (taskId ? s.taskDetailMap[taskId]?.teamId : undefined));

  // The owner crumb mirrors Linear's `Owner › ISSUE` trail: the project chip
  // when the task is filed under one, else the owning team's name, else the
  // plain "Tasks" root. All three resolve from data — nothing is fabricated.
  useProjectStore((s) => s.useFetchProjectDetail)(taskProjectId ?? undefined);
  const needTeam = !!taskId && !taskProjectId && !!taskTeamId;
  const { data: teamsResponse } = useClientDataSWR(needTeam ? ['project/teams'] : null, () =>
    projectService.teams(),
  );
  const project = useCurrentProjectDetail(taskProjectId ?? undefined)?.project;
  const team = needTeam ? teamsResponse?.data.find((row) => row.id === taskTeamId) : undefined;

  const allTasksLabel = (
    <Text color={'inherit'} weight={500}>
      {t('taskList.all')}
    </Text>
  );

  // Project wins over team, matching Linear's "issue belongs to a project,
  // otherwise to its team" trail. While the owning entity is still resolving
  // the crumb falls back to "Tasks" rather than flashing a raw id.
  const ownerCrumb = project
    ? {
        title: (
          <WorkspaceLink to={`/project/${project.slug || project.id}`}>
            <span
              style={{
                alignItems: 'center',
                display: 'inline-flex',
                gap: 6,
                minWidth: 0,
              }}
            >
              <Avatar
                avatar={projectAvatar(project.avatar, 14)}
                background={project.avatar ? undefined : 'transparent'}
                name={project.name}
                shape={'square'}
                size={14}
                style={{ flex: 'none' }}
              />
              <Text ellipsis color={'inherit'} style={{ maxWidth: 160, minWidth: 0 }} weight={500}>
                {project.name}
              </Text>
            </span>
          </WorkspaceLink>
        ),
      }
    : team
      ? {
          title: (
            <WorkspaceLink to={`/teams/${team.id}`}>
              <Text ellipsis color={'inherit'} style={{ maxWidth: 160, minWidth: 0 }} weight={500}>
                {team.name}
              </Text>
            </WorkspaceLink>
          ),
        }
      : undefined;

  const agentCrumb =
    aid && agentMeta
      ? {
          key: `agent-${aid}`,
          title: (
            <Text
              ellipsis
              color={'inherit'}
              style={{ maxWidth: 160 }}
              type={taskId ? undefined : 'secondary'}
              weight={500}
            >
              {agentDisplayName(agentMeta)}
            </Text>
          ),
        }
      : undefined;

  // The agent crumb links to its task list only when it is not the current page
  // (i.e. when a deeper task crumb follows it).
  const agentCrumbNode =
    agentCrumb && taskId
      ? {
          ...agentCrumb,
          title: <WorkspaceLink to={`/agent/${aid}/tasks`}>{agentCrumb.title}</WorkspaceLink>,
        }
      : agentCrumb;

  const currentTaskCrumb = taskId
    ? {
        title: (
          <span
            style={{
              alignItems: 'center',
              display: 'inline-flex',
              gap: 6,
              maxWidth: '100%',
              minWidth: 0,
            }}
          >
            {taskIdentifier && (
              <Text
                as={'span'}
                color={'inherit'}
                style={{ flexShrink: 0 }}
                type={'secondary'}
                weight={500}
              >
                {taskIdentifier}
              </Text>
            )}
            <Text
              ellipsis
              as={'span'}
              color={'inherit'}
              style={{ flex: '1 1 auto', maxWidth: 240, minWidth: 0 }}
              weight={500}
            >
              {taskTitle || taskId}
            </Text>
          </span>
        ),
      }
    : undefined;

  return (
    <AntBreadcrumb
      className={styles.breadcrumb}
      separator={<Icon icon={ChevronRight} />}
      items={[
        ownerCrumb ?? {
          title:
            taskId || agentCrumbNode ? (
              <WorkspaceLink to={'/tasks'}>{allTasksLabel}</WorkspaceLink>
            ) : (
              allTasksLabel
            ),
        },
        ...(agentCrumbNode ? [agentCrumbNode] : []),
        ...(currentTaskCrumb ? [currentTaskCrumb] : []),
      ]}
    />
  );
});

export default Breadcrumb;
