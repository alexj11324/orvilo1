import { cn } from 'cn';
import { type CSSProperties, memo, type ReactNode } from 'react';

import styles from './FileIcon.module.css';

export interface FileTypeIconProps {
  className?: string;
  /** Sheet color; defaults to the geekblue identity hue. Ignored when `variant="mono"`. */
  color?: string;
  /** Extension label drawn on the sheet, truncated to four characters. */
  filetype?: string;
  /** Glyph centered on the upper half of the sheet. */
  icon?: ReactNode;
  size?: number;
  style?: CSSProperties;
  type?: 'file' | 'folder';
  /** `mono` draws a neutral sheet that a smaller icon sits on. */
  variant?: 'color' | 'mono';
}

const FILE_PATH = 'M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H6z';
const FOLD_PATH = 'M14 2l6 6h-4a2 2 0 01-2-2V2z';
const FOLDER_PATH =
  'M10.46 5.076l-.92-.752A1.446 1.446 0 008.626 4H3.429c-.38 0-.743.147-1.01.41A1.386 1.386 0 002 5.4v13.2c0 .371.15.727.418.99.268.262.632.41 1.01.41h17.143c.38 0 .743-.148 1.01-.41.268-.263.419-.619.419-.99V6.8c0-.371-.15-.727-.418-.99a1.444 1.444 0 00-1.01-.41h-9.198c-.334 0-.657-.115-.914-.324z';

const labelFontSize = (label?: string) =>
  label && label.length > 3 ? 24 / (4 + (label.length - 3)) : 6;

/** A document or folder sheet labelled with its file type. */
const FileTypeIcon = memo<FileTypeIconProps>(
  ({ className, color, filetype, icon, size = 48, style, type = 'file', variant }) => {
    const isMono = variant === 'mono';
    const label = filetype && filetype.length > 4 ? filetype.slice(0, 4) : filetype;
    const fill = isMono ? 'var(--file-icon-mono-fill)' : color || 'var(--palette-geekblue-6)';
    const labelFill = isMono ? 'var(--muted-foreground)' : '#fff';
    const fontSize = labelFontSize(label);

    const sheet = (
      <svg
        className={cn(styles.sheet, isMono && styles.mono, !icon && className)}
        height={size}
        style={icon ? undefined : style}
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {type === 'file' ? (
          <>
            <path d={FILE_PATH} fill={fill} />
            <path
              d={FOLD_PATH}
              fill={isMono ? 'var(--file-icon-mono-fold)' : '#fff'}
              fillOpacity=".5"
            />
            {label && (
              <text
                fill={labelFill}
                fontSize={fontSize}
                fontWeight="bold"
                textAnchor="middle"
                x="50%"
                y="70%"
              >
                {label.toUpperCase()}
              </text>
            )}
            <path d={FILE_PATH} fill="transparent" stroke="var(--selected)" strokeWidth={0.5} />
          </>
        ) : (
          <>
            <path d={FOLDER_PATH} fill={fill} stroke="var(--selected)" strokeWidth={0.5} />
            {!icon && filetype && (
              <text
                fill={labelFill}
                fontSize={fontSize}
                fontWeight="bold"
                textAnchor="middle"
                x="50%"
                y="70%"
              >
                {filetype.toUpperCase()}
              </text>
            )}
          </>
        )}
      </svg>
    );

    if (!icon) return sheet;

    return (
      <div
        className={cn('relative flex flex-none items-center justify-center', className)}
        style={{ height: size, width: size, ...style }}
      >
        <div
          className="absolute z-1"
          style={{ fontSize: size / 2.4, top: type === 'file' ? '20%' : '16%' }}
        >
          {icon}
        </div>
        {sheet}
      </div>
    );
  },
);
FileTypeIcon.displayName = 'FileTypeIcon';

export default FileTypeIcon;
