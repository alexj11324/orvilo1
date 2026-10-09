import { describe, expect, it } from 'vitest';

import { toolbarActionLabel } from './toolbarActionLabel';

describe('toolbarActionLabel', () => {
  it('keeps an accessible name and withholds the tooltip while the namespace loads', () => {
    expect(toolbarActionLabel(false, 'actions.addNewTopic', 'Start New Topic')).toEqual({
      'aria-label': 'Start New Topic',
      'title': undefined,
    });
  });

  it('uses the translation for both once the namespace is ready', () => {
    expect(toolbarActionLabel(true, '开启新话题', 'Start New Topic')).toEqual({
      'aria-label': '开启新话题',
      'title': '开启新话题',
    });
  });
});
