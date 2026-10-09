/** OpenCode glob returns absolute file paths, one per line. Unknown/truncated formats stay raw. */
export const parseOpenCodeGlob = (content: string) => {
  if (!content.trim() || content.length > 200_000) return;
  const paths = content
    .trim()
    .split('\n')
    .map((path) => path.trim());
  if (paths.some((path) => !/^(?:\/|[A-Z]:[\\/])/.test(path))) return;
  return [...new Set(paths)].map((path) => ({
    isDirectory: false,
    name: path.split(/[\\/]/).at(-1) || path,
    path,
  }));
};
