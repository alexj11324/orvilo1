import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { projectAvatar, ProjectIcon } from './ProjectIcon';

describe('projectAvatar', () => {
  it('falls back to the box mark, never the project name', () => {
    // The project header used to pass `avatar || name`; `Avatar` renders a
    // non-emoji string verbatim, clipping the name inside a 28px tile.
    for (const missing of [null, undefined, '']) {
      const node = projectAvatar(missing, 16);
      expect(isValidElement(node)).toBe(true);
      expect(isValidElement(node) && node.type).toBe(ProjectIcon);
      expect(isValidElement<{ size: number }>(node) && node.props.size).toBe(16);
    }
  });

  it('keeps a custom avatar', () => {
    expect(projectAvatar('🚀', 16)).toBe('🚀');
    expect(projectAvatar('https://example.com/p.png', 16)).toBe('https://example.com/p.png');
  });
});
