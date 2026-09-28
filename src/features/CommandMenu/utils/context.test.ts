import { describe, expect, it } from 'vitest';

import { detectContext } from './context';

describe('detectContext', () => {
  it('detects agent context for base and topic routes', () => {
    expect(detectContext('/agent/agt_123')).toBe('agent');
    expect(detectContext('/agent/agt_123/tpc_456')).toBe('agent');
  });

  it('keeps agent context for page routes nested under a topic', () => {
    expect(detectContext('/agent/agt_123/tpc_456/page')).toBe('agent');
    expect(detectContext('/agent/agt_123/tpc_456/page/doc_789')).toBe('agent');
  });

  it('detects memory context while keeping the retained preferences route', () => {
    expect(detectContext('/memory')).toBe('memory');
    expect(detectContext('/memory/preferences')).toBe('memory');
  });

  it('falls back to general for retired workbench routes', () => {
    // /image and /video are retired surfaces — they must not resurrect the
    // removed painting/video contexts (deep links are handled outside cmdk).
    expect(detectContext('/image')).toBe('general');
    expect(detectContext('/video')).toBe('general');
    expect(detectContext('/eval')).toBe('general');
    expect(detectContext('/memory-center')).toBe('general');
  });

  it('falls back to general for unknown routes', () => {
    expect(detectContext('/unknown')).toBe('general');
  });

  it('strips a leading workspace slug before matching', () => {
    expect(detectContext('/orvilo-dev/agent/agt_123')).toBe('agent');
    expect(detectContext('/orvilo-dev/settings/appearance')).toBe('settings');
    expect(detectContext('/orvilo-dev/memory')).toBe('memory');
  });

  it('detects work-surface contexts under a workspace slug', () => {
    expect(detectContext('/orvilo-dev/project/prj_1')).toBe('project');
    expect(detectContext('/orvilo-dev/task/tsk_1')).toBe('task');
    expect(detectContext('/orvilo-dev/teams/team_1')).toBe('team');
    expect(detectContext('/orvilo-dev/inbox')).toBe('inbox');
    expect(detectContext('/orvilo-dev/views')).toBe('general');
  });
});
