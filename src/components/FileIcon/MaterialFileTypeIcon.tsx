import { type CSSProperties, memo } from 'react';

import FileTypeIcon from './FileTypeIcon';
import { getMaterialIconUrl } from './materialIcon';

export interface MaterialFileTypeIconProps {
  className?: string;
  /** Draw a labelled sheet instead of the generic icon for unknown types. */
  fallbackUnknownType?: boolean;
  filename: string;
  /** Use the open variant of a folder icon. */
  open?: boolean;
  size?: number;
  style?: CSSProperties;
  type?: 'file' | 'folder';
  /** `raw` draws the icon alone; `file`/`folder` set it on a neutral sheet. */
  variant?: 'raw' | 'file' | 'folder';
}

/** File or folder icon from the Material Icon Theme, picked by name. */
const MaterialFileTypeIcon = memo<MaterialFileTypeIconProps>(
  ({
    className,
    fallbackUnknownType = true,
    filename,
    open,
    size = 48,
    style,
    type = 'file',
    variant = 'raw',
  }) => {
    const iconUrl = getMaterialIconUrl({ fallbackUnknownType, open, path: filename, type });

    if (!iconUrl)
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
          alt={filename}
          className={className}
          height={size}
          src={iconUrl}
          style={style}
          width={size}
        />
      );

    return (
      <div
        className={className}
        style={{
          alignItems: 'center',
          display: 'flex',
          flex: 'none',
          height: size,
          justifyContent: 'center',
          position: 'relative',
          width: size,
          ...style,
        }}
      >
        <FileTypeIcon size={size} type={variant} variant="mono" />
        <img
          alt={filename}
          height={size / 2}
          src={iconUrl}
          style={{ position: 'absolute', top: size / 3 }}
          width={size / 2}
        />
      </div>
    );
  },
);
MaterialFileTypeIcon.displayName = 'MaterialFileTypeIcon';

export default MaterialFileTypeIcon;
