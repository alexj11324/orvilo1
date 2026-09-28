import { describe, expect, it } from 'vitest';

import { resolveNavPanelKey } from './routeKey';

describe('resolveNavPanelKey', () => {
  it.each([
    ['/', null, 'home'],
    ['/orvilo-team', 'orvilo-team', 'home'],
    ['/tasks', null, 'home'],
    ['/orvilo-team/task/task-1', 'orvilo-team', 'home'],
    ['/agent/agent-1', null, 'agent'],
    ['/orvilo-team/agent/agent-1', 'orvilo-team', 'agent'],
    ['/agent/agent-1/docs', null, 'agent-docs'],
    ['/agent/agent-1/docs/docs-1', null, 'agent-docs'],
    ['/orvilo-team/agent/agent-1/docs/docs-1', 'orvilo-team', 'agent-docs'],
    ['/group/group-1', null, 'group'],
    ['/settings/profile', null, 'settings'],
    ['/orvilo-team/settings/general', 'orvilo-team', 'workspace-settings'],
    ['/orvilo-team/resource', 'orvilo-team', 'resource'],
    ['/orvilo-team/resource/library', 'orvilo-team', 'resourceLibrary'],
    ['/orvilo-team/memory', 'orvilo-team', 'memory'],
    ['/orvilo-team/page/page-1', 'orvilo-team', 'page'],
    ['/project/project-1', null, 'home'],
    ['/orvilo-team/project/project-1/library/kb-1', 'orvilo-team', 'home'],
    ['/orvilo-team/image', 'orvilo-team', 'image'],
    ['/orvilo-team/video', 'orvilo-team', 'video'],
  ])('maps %s to %s', (pathname, activeWorkspaceSlug, expected) => {
    expect(resolveNavPanelKey(pathname, activeWorkspaceSlug)).toBe(expected);
  });
});
