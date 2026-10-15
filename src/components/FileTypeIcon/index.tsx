import type { ReactNode, SVGProps } from 'react';

import { useIsDark } from '@/hooks/useIsDark';

export interface FileTypeIconProps extends Omit<SVGProps<SVGSVGElement>, 'type'> {
  color?: string;
  filetype?: string;
  icon?: ReactNode;
  size?: number;
  type?: 'file' | 'folder';
  variant?: 'mono' | string;
}
const FileTypeIcon = ({
  color,
  filetype,
  icon,
  size = 48,
  type = 'file',
  variant,
  style,
  className,
  ...props
}: FileTypeIconProps) => {
  const dark = useIsDark();
  const mono = variant === 'mono';
  const short = filetype && filetype.length > 4 ? filetype.slice(0, 4) : filetype;
  const fontSize = short && short.length > 3 ? 24 / (4 + short.length - 3) : 6;
  const fill = mono
    ? dark
      ? 'var(--scrollbar-fill)'
      : 'var(--card)'
    : (color ?? 'var(--primary)');
  const file = 'M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H6z';
  const folder =
    'M10.46 5.076l-.92-.752A1.446 1.446 0 008.626 4H3.429c-.38 0-.743.147-1.01.41A1.386 1.386 0 002 5.4v13.2c0 .371.15.727.418.99.268.262.632.41 1.01.41h17.143c.38 0 .743-.148 1.01-.41.268-.263.419-.619.419-.99V6.8c0-.371-.15-.727-.418-.99a1.444 1.444 0 00-1.01-.41h-9.198c-.334 0-.657-.115-.914-.324z';
  const drawing = (
    <svg
      {...props}
      className={icon ? undefined : className}
      height={size}
      style={icon ? undefined : style}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={type === 'file' ? file : folder}
        fill={fill}
        stroke={type === 'folder' ? 'var(--selected)' : undefined}
        strokeWidth={type === 'folder' ? 0.5 : undefined}
      />
      {type === 'file' && (
        <path
          d="M14 2l6 6h-4a2 2 0 01-2-2V2z"
          fill={mono ? 'var(--scrollbar-fill)' : '#fff'}
          fillOpacity=".5"
        />
      )}
      {!icon && filetype && (
        <text
          fill={mono ? 'var(--muted-foreground)' : '#fff'}
          fontSize={fontSize}
          fontWeight="bold"
          textAnchor="middle"
          x="50%"
          y="70%"
        >
          {(type === 'file' ? short : filetype)?.toUpperCase()}
        </text>
      )}
      {type === 'file' && (
        <path d={file} fill="transparent" stroke="var(--selected)" strokeWidth={0.5} />
      )}
    </svg>
  );
  return icon ? (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
      style={{ height: size, width: size, ...style }}
    >
      <span
        className="absolute inline-flex items-center justify-center"
        style={{ fontSize: size / 2.4, top: type === 'file' ? '20%' : '16%' }}
      >
        {icon}
      </span>
      {drawing}
    </span>
  ) : (
    drawing
  );
};
export default FileTypeIcon;
