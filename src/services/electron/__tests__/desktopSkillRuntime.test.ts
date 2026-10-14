import { describe, expect, it } from 'vitest';

import { desktopSkillRuntimeService } from '../desktopSkillRuntime';

describe('platform skill archive retirement', () => {
  it('does not resolve platform archives into local execution or resource paths', async () => {
    expect(
      await desktopSkillRuntimeService.resolveExecutionDirectory([
        { id: 'old-skill', name: 'old-skill' },
      ]),
    ).toBeUndefined();
    expect(
      await desktopSkillRuntimeService.resolveReferenceFullPath({
        path: 'script.py',
        skillId: 'old-skill',
      }),
    ).toBeUndefined();
  });
});
