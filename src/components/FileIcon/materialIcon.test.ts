import { describe, expect, it } from 'vitest';

import {
  getFileIconName,
  getFolderIconName,
  getMaterialIconUrl,
  MATERIAL_ICONS_URL,
} from './materialIcon';

describe('material icon lookup', () => {
  it('resolves file names before extensions', () => {
    expect(getFileIconName('src/package.json')).toBe('nodejs');
    expect(getFileIconName('a/b/index.tsx')).toBe('react_ts');
    expect(getFileIconName('notes.md')).toBe('markdown');
    expect(getFileIconName('unknown.zzz')).toBe('file');
  });

  it('resolves named folders', () => {
    expect(getFolderIconName('repo/src')).toBe('folder-src');
    expect(getFolderIconName('nothing-special')).toBe('folder');
  });

  it('builds CDN urls and blanks unknown types when the caller draws a fallback', () => {
    expect(getMaterialIconUrl({ fallbackUnknownType: true, path: 'x.zzz', type: 'file' })).toBe('');
    expect(getMaterialIconUrl({ path: 'x.zzz', type: 'file' })).toBe(
      `${MATERIAL_ICONS_URL}/file.svg`,
    );
    expect(getMaterialIconUrl({ open: true, path: 'src', type: 'folder' })).toBe(
      `${MATERIAL_ICONS_URL}/folder-src-open.svg`,
    );
    expect(
      getMaterialIconUrl({ fallbackUnknownType: false, path: 'my-stuff', type: 'folder' }),
    ).toBe(`${MATERIAL_ICONS_URL}/folder.svg`);
  });
});
