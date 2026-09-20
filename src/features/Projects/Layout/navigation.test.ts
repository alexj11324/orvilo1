import { describe, expect, it } from 'vitest';

import {
  getProjectAgentPath,
  getProjectConversationPath,
  getProjectConversationStartPath,
  getProjectGoalsPath,
  getProjectLibraryPath,
  getProjectOverviewPath,
  getProjectResourcesPath,
  getProjectTasksPath,
} from './navigation';

describe('project workspace navigation', () => {
  it('builds routes for project agents and libraries', () => {
    expect(getProjectAgentPath('agt_1')).toBe('/agent/agt_1');
    expect(getProjectLibraryPath('prj_1', 'kb_1')).toBe('/project/prj_1/library/kb_1');
    expect(getProjectOverviewPath('prj_1')).toBe('/project/prj_1/overview');
    expect(getProjectTasksPath('prj_1')).toBe('/project/prj_1/tasks');
    expect(getProjectGoalsPath('prj_1')).toBe('/project/prj_1/goals');
    expect(getProjectResourcesPath('prj_1')).toBe('/project/prj_1/resources');
  });

  // The project-level acceptance module was retired. There is no
  // `getProjectAcceptancePath` to assert: the route, the sidebar entry and the
  // dashboard button all went with it. Leaving a path builder here is how a
  // dead link survives — the sidebar would keep navigating and the user would
  // land back on the app root instead of the project.
  it('exposes no path builder for the retired project acceptance module', async () => {
    const navigation = await import('./navigation');

    expect(navigation).not.toHaveProperty('getProjectAcceptancePath');
  });

  it('builds new and existing conversation routes inside the project', () => {
    expect(getProjectConversationPath('prj_1')).toBe('/project/prj_1/conversation');
    expect(getProjectConversationPath('prj_1', 'tpc_1')).toBe('/project/prj_1/conversation/tpc_1');
    expect(getProjectConversationStartPath('prj_1', 'Plan Q3 & ship')).toBe(
      '/project/prj_1/conversation?message=Plan%20Q3%20%26%20ship',
    );
  });
});
