export const getProjectAgentPath = (agentId: string) => `/agent/${agentId}`;

export const getProjectConversationPath = (projectId: string, topicId?: string) =>
  topicId ? `/project/${projectId}/conversation/${topicId}` : `/project/${projectId}/conversation`;

export const getProjectConversationStartPath = (projectId: string, message: string) =>
  `${getProjectConversationPath(projectId)}?message=${encodeURIComponent(message)}`;

export const getProjectLibraryPath = (projectId: string, libraryId: string) =>
  `/project/${projectId}/library/${libraryId}`;

export const getProjectOverviewPath = (projectId: string) => `/project/${projectId}/overview`;

export const getProjectActivityPath = (projectId: string) => `/project/${projectId}/activity`;

export const getProjectTasksPath = (projectId: string) => `/project/${projectId}/tasks`;

export const getProjectMilestonesPath = (projectId: string) => `/project/${projectId}/milestones`;

export const getProjectGoalsPath = (projectId: string) => `/project/${projectId}/goals`;

export const getProjectResourcesPath = (projectId: string) => `/project/${projectId}/resources`;

export type ProjectSection =
  | 'overview'
  | 'activity'
  | 'tasks'
  | 'milestones'
  | 'goals'
  | 'resources'
  | 'conversation'
  | 'library';

// Project tabs are keyed by section, not the rendered href: workspace-prefixed
// paths (/ws/project/x/tasks) and id-vs-slug deep links make literal pathname
// equality unreliable.
export const projectPathSection = (pathname: string): ProjectSection | undefined => {
  const match = /^.*\/project\/[^/]+\/([^/?#]+)/.exec(pathname);
  const segment = match?.[1];
  switch (segment) {
    case 'overview':
    case 'activity':
    case 'tasks':
    case 'milestones':
    case 'goals':
    case 'resources':
    case 'conversation':
    case 'library': {
      return segment;
    }
    default: {
      return undefined;
    }
  }
};
