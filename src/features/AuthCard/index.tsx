'use client';

import { clsx as cx, cn } from 'cn';
import { type ComponentProps, type ReactNode } from 'react';
import { memo } from 'react';

export type AuthCardVariant = 'auth16' | 'default';

export interface AuthCardProps extends Omit<ComponentProps<'div'>, 'title'> {
  footer?: ReactNode;
  subtitle?: ReactNode;
  title?: ReactNode;
  variant?: AuthCardVariant;
}

export const AuthCard = memo<AuthCardProps>(
  ({ children, title, subtitle, footer, variant = 'default', ...rest }) => {
    const isAuth16 = variant === 'auth16';
    const TitleTag = isAuth16 ? 'h1' : 'div';
    const SubtitleTag = isAuth16 ? 'p' : 'div';
    const { className, ...flexboxProps } = rest;

    return (
      <div
        className={cx(
          cx(
            // A supplied style replaces the original default style object as a whole.
            'style' in flexboxProps
              ? isAuth16 && 'w-[min(100%,24rem)]'
              : isAuth16
                ? 'w-[min(100%,384px)] gap-6'
                : 'w-[min(100%,440px)]',
            className,
          ),
          'flex flex-col',
        )}
        {...flexboxProps}
      >
        <div className={cn('flex flex-col', isAuth16 ? 'gap-2' : 'gap-4')}>
          {title && (
            <TitleTag
              className={cn('text-3xl leading-9 font-semibold', isAuth16 && 'm-0 text-center')}
            >
              {title}
            </TitleTag>
          )}
          {subtitle && (
            <SubtitleTag
              className={cn(
                'text-sm leading-5.5 text-muted-foreground',
                isAuth16 ? 'm-0 text-center font-normal' : 'font-medium',
              )}
            >
              {subtitle}
            </SubtitleTag>
          )}
        </div>
        <div className={cn('flex flex-col', isAuth16 ? 'gap-3 py-0' : 'gap-1 py-8')}>
          {children}
        </div>
        {footer}
      </div>
    );
  },
);

export default AuthCard;
