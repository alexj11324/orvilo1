import { type IconType } from '@lobehub/icons';
import { BRANDING_LOGO_URL, BRANDING_NAME } from '@orvilo/business-const';
import { cn } from 'cn';
import { type HTMLAttributes, type ReactNode } from 'react';
import { memo } from 'react';

import { type ImageProps } from '@/libs/next/Image';
import Image from '@/libs/next/Image';

const CustomTextLogo = memo<HTMLAttributes<HTMLDivElement> & { size: number }>(
  ({ size, style, ...rest }) => {
    return (
      <div
        className={'flex flex-col'}
        style={{
          fontSize: size / 1.5,
          fontWeight: 'bolder',
          userSelect: 'none',
          ...style,
          height: size,
        }}
        {...rest}
      >
        {BRANDING_NAME}
      </div>
    );
  },
);

const CustomImageLogo = memo<Omit<ImageProps, 'alt' | 'src'> & { size: number }>(
  ({ size, ...rest }) => {
    return (
      <Image
        alt={BRANDING_NAME}
        height={size}
        src={BRANDING_LOGO_URL}
        unoptimized={true}
        width={size}
        {...rest}
      />
    );
  },
);

const Divider: IconType = (({ ref, size = '1em', style, ...rest }) => (
  <svg
    className={'flex-none leading-none'}
    fill="none"
    height={size}
    ref={ref}
    shapeRendering="geometricPrecision"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    viewBox="0 0 24 24"
    width={size}
    {...rest}
  >
    <path d="M16.88 3.549L7.12 20.451" />
  </svg>
)) as IconType;

export interface ProductLogoProps extends HTMLAttributes<HTMLDivElement> {
  extra?: ReactNode;
  size?: number;
  type?: '3d' | 'flat' | 'mono' | 'text' | 'combine';
}

const CustomLogo = memo<ProductLogoProps>(
  ({ extra, size = 32, className, style, type, ...rest }) => {
    let logoComponent: ReactNode;

    switch (type) {
      case '3d':
      case 'flat': {
        logoComponent = <CustomImageLogo size={size} style={style} {...rest} />;
        break;
      }
      case 'mono': {
        logoComponent = (
          <CustomImageLogo size={size} style={{ filter: 'grayscale(100%)', ...style }} {...rest} />
        );
        break;
      }
      case 'text': {
        logoComponent = <CustomTextLogo size={size} style={style} {...rest} />;
        break;
      }
      case 'combine': {
        logoComponent = (
          <>
            <CustomImageLogo size={size} />
            <CustomTextLogo size={size} style={{ marginInlineStart: Math.round(size / 4) }} />
          </>
        );

        if (!extra)
          logoComponent = <div className={'flex flex-none items-center'}>{logoComponent}</div>;

        break;
      }
      default: {
        logoComponent = <CustomImageLogo size={size} style={style} {...rest} />;
        break;
      }
    }

    if (!extra) return logoComponent;

    const extraSize = Math.round((size / 3) * 1.9);

    return (
      <div className={cn('flex items-center', className)} style={{ flex: 'none' }}>
        {logoComponent}
        <Divider className="flex-none leading-none text-divider" size={extraSize} />
        <div className="whitespace-nowrap font-normal" style={{ fontSize: extraSize }}>
          {extra}
        </div>
      </div>
    );
  },
);

export default CustomLogo;
