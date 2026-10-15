import { describe, expect, it } from 'vitest';

import {
  getIconForDirectoryPath,
  getIconForFilePath,
  getIconUrlForDirectoryPath,
  getIconUrlForFilePath,
} from './utils.mjs';

describe('licensed material filename associations', () => {
  it('recognizes extensions and exact special filenames without generic substitution', () => {
    expect(getIconForFilePath('src/main.ts')).toBe('typescript');
    expect(getIconForFilePath('src/main.js')).toBe('javascript');
    expect(getIconForFilePath('README.md')).not.toBe('file');
  });
  it('retains folder identity and open suffix', () => {
    const args = { path: '.github', iconsUrl: '/assets', fallbackUnknownType: false };
    expect(getIconForDirectoryPath('.github')).not.toBe('folder');
    expect(getIconUrlForDirectoryPath({ ...args, open: true })).toBe(
      `${getIconUrlForDirectoryPath(args).slice(0, -4)}-open.svg`,
    );
  });
  it('preserves explicit unknown fallback policy', () => {
    const args = { path: 'unknown.orvilo-private-unknown', iconsUrl: '/assets' };
    expect(getIconUrlForFilePath({ ...args, fallbackUnknownType: true })).toBe('');
    expect(getIconUrlForFilePath({ ...args, fallbackUnknownType: false })).toBe('/assets/file.svg');
  });
});
