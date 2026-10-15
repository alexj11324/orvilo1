import type { HTMLAttributes } from 'react';

import FileTypeIcon from '@/components/FileTypeIcon';

import { getIconUrlForDirectoryPath, getIconUrlForFilePath } from './utils.mjs';

const ASSETS = 'https://registry.npmmirror.com/@lobehub/assets-fileicon/1.0.0/files/assets';
export interface MaterialFileTypeIconProps extends HTMLAttributes<HTMLElement> {
  fallbackUnknownType?: boolean;
  filename: string;
  open?: boolean;
  size?: number;
  type?: 'file' | 'folder';
  variant?: 'raw' | 'file' | 'folder';
}
const MaterialFileTypeIcon = ({
  fallbackUnknownType = true,
  filename,
  size = 48,
  variant = 'raw',
  type = 'file',
  style,
  open,
  className,
  ...props
}: MaterialFileTypeIconProps) => {
  const args = { fallbackUnknownType, iconsUrl: ASSETS, path: filename, open };
  const src = type === 'file' ? getIconUrlForFilePath(args) : getIconUrlForDirectoryPath(args);
  if (!src)
    return (
      <FileTypeIcon
        className={className}
        filetype={filename.split('.')[1]}
        size={size}
        type={type}
        variant="mono"
      />
    );
  if (variant === 'raw')
    return (
      <img
        {...props}
        alt={filename}
        className={className}
        height={size}
        src={src}
        style={style}
        width={size}
      />
    );
  return (
    <span
      {...props}
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
      style={{ height: size, width: size, ...style }}
    >
      <FileTypeIcon size={size} type={variant} variant="mono" />
      <img
        alt={filename}
        height={size / 2}
        src={src}
        style={{ position: 'absolute', top: size / 3 }}
        width={size / 2}
      />
    </span>
  );
};
export default MaterialFileTypeIcon;
