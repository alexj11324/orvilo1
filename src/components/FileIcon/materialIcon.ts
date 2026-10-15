/**
 * Name lookups for the Material Icon Theme file icons (MIT, Philipp Kief),
 * as published in `@lobehub/assets-fileicon`. The SVGs are served from the
 * package CDN; `materialIconMap.json` maps file names, extensions and folder
 * names to icon names.
 */
import iconMap from './materialIconMap.json';

const { fileExtensions, fileNames, folderNames } = iconMap as Record<
  'fileExtensions' | 'fileNames' | 'folderNames',
  Record<string, string>
>;

export const MATERIAL_ICONS_URL =
  'https://registry.npmmirror.com/@lobehub/assets-fileicon/1.0.0/files/assets';

const baseName = (path: string) => path.split('/').at(-1) ?? path;

export const getFileIconName = (path: string): string => {
  const name = baseName(path);
  return (
    fileNames[name] ??
    fileNames[name.toLowerCase()] ??
    fileExtensions[name.slice(name.indexOf('.') + 1)] ??
    fileExtensions[name.slice(Math.max(0, name.lastIndexOf('.') + 1))] ??
    (name.endsWith('.html') ? 'html' : null) ??
    (name.endsWith('.ts') ? 'typescript' : null) ??
    (name.endsWith('.js') ? 'javascript' : null) ??
    'file'
  );
};

export const getFolderIconName = (path: string): string => {
  const name = baseName(path);
  return folderNames[name] ?? folderNames[name.toLowerCase()] ?? 'folder';
};

/**
 * Icon URL for a file or folder path. Returns `''` for the generic icon when
 * `fallbackUnknownType` is set, so the caller can draw its own fallback.
 */
export const getMaterialIconUrl = ({
  fallbackUnknownType,
  open,
  path,
  type,
}: {
  fallbackUnknownType?: boolean;
  open?: boolean;
  path: string;
  type: 'file' | 'folder';
}): string => {
  const name = type === 'file' ? getFileIconName(path) : getFolderIconName(path);
  if (fallbackUnknownType && name === (type === 'file' ? 'file' : 'folder')) return '';
  return `${MATERIAL_ICONS_URL}/${name}${type === 'folder' && open ? '-open' : ''}.svg`;
};
