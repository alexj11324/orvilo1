import type { FileDiffOptions } from '@pierre/diffs';

export function patchDisplayName(patch: string, fileName?: string, language?: string): string {
  if (fileName) return fileName;
  for (const rawLine of patch.split('\n')) {
    if (!rawLine.startsWith('---') && !rawLine.startsWith('+++')) continue;
    if (!/\s/u.test(rawLine[3] ?? '')) continue;
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const value = line.slice(3).trimStart();
    const name = value.startsWith('a/') || value.startsWith('b/') ? value.slice(2) : value;
    const tab = name.indexOf('\t');
    const headerName = tab === -1 ? name : name.slice(0, tab);
    if (headerName) return headerName;
  }
  return language || 'patch';
}

export function countPatchChanges(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

/** Preserve the genuine SDK's option precedence, including full caller callbacks,
 * theme overrides and replacement (rather than concatenation) of unsafeCSS. */
export function patchDiffOptions(
  isDark: boolean,
  viewMode: 'split' | 'unified',
  unsafeCSS: string,
  overrides?: FileDiffOptions<string>,
): FileDiffOptions<string> {
  return {
    theme: { dark: 'orvilo-diff', light: 'orvilo-diff' },
    themeType: isDark ? 'dark' : 'light',
    diffStyle: viewMode,
    disableFileHeader: true,
    unsafeCSS,
    ...overrides,
  };
}
