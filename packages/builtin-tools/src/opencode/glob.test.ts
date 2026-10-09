import { expect, it } from 'vitest';

import { parseOpenCodeGlob } from './glob';

it('renders actual absolute glob matches including spaces', () => {
  expect(parseOpenCodeGlob('/repo/a.ts\n/repo/my file.txt')).toEqual([
    { isDirectory: false, name: 'a.ts', path: '/repo/a.ts' },
    { isDirectory: false, name: 'my file.txt', path: '/repo/my file.txt' },
  ]);
});
it('keeps empty, error and truncated output raw', () => {
  for (const text of [
    '',
    'No files found',
    '/repo/a.ts\nResults truncated',
    'Error: access denied',
  ])
    expect(parseOpenCodeGlob(text)).toBeUndefined();
});
