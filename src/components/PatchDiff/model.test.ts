import { describe, expect, it, vi } from 'vitest';

import { countPatchChanges, patchDiffOptions, patchDisplayName } from './model';

describe('PatchDiff adapter contracts', () => {
  it('counts changed content without counting filenames or no-newline markers', () => {
    expect(
      countPatchChanges(
        '--- a/文件.ts\n+++ b/文件.ts\n@@ -1,2 +1,2 @@\n context\n-old\n+new\n\\ No newline at end of file',
      ),
    ).toEqual({ additions: 1, deletions: 1 });
  });

  it('preserves filename, patch-header and language fallback precedence', () => {
    const patch = '--- a/nested/file.ts\t2026-10-15\n+++ b/nested/file.ts';
    expect(patchDisplayName(patch, 'explicit.ts', 'typescript')).toBe('explicit.ts');
    expect(patchDisplayName(patch, '', 'typescript')).toBe('nested/file.ts');
    expect(patchDisplayName('', undefined, 'typescript')).toBe('typescript');
    expect(patchDisplayName('', '', '')).toBe('patch');
  });

  it('keeps whitespace-only headers separate from the following filename', () => {
    expect(patchDisplayName(`--- ${' '.repeat(20_000)}\n+++ b/文件.ts\r\n`)).toBe('文件.ts');
  });

  it('forwards actual Pierre callback identities and complete caller theme/CSS options', () => {
    const onGutterUtilityClick = vi.fn();
    const onLineSelected = vi.fn();
    const options = patchDiffOptions(false, 'split', 'default-css', {
      theme: { light: 'github-light', dark: 'github-dark' },
      themeType: 'dark',
      diffStyle: 'unified',
      unsafeCSS: 'caller-css',
      overflow: 'wrap',
      enableLineSelection: true,
      lineDiffType: 'word-alt',
      onGutterUtilityClick,
      onLineSelected,
    });
    expect(options).toMatchObject({
      theme: { light: 'github-light', dark: 'github-dark' },
      themeType: 'dark',
      diffStyle: 'unified',
      unsafeCSS: 'caller-css',
      overflow: 'wrap',
      enableLineSelection: true,
      lineDiffType: 'word-alt',
      disableFileHeader: true,
    });
    expect(options.onGutterUtilityClick).toBe(onGutterUtilityClick);
    expect(options.onLineSelected).toBe(onLineSelected);
  });
});
