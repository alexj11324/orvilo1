'use client';

import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { type ComponentProps, type ReactNode } from 'react';
import { memo } from 'react';

const styles = createStaticStyles(({ css }) => ({
  auth16Root: css`
    width: min(100%, 24rem);
  `,

  auth16Subtitle: css`
    line-height: 1.5;
  `,

  auth16Title: css`
    line-height: 1.25;
    letter-spacing: -0.02em;
  `,
}));

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
        className={cx(cx(isAuth16 && styles.auth16Root, className), 'flex flex-col')}
        style={{
          gap: isAuth16 ? 24 : undefined,
          width: isAuth16 ? 'min(100%,384px)' : 'min(100%,440px)',
        }}
        {...flexboxProps}
      >
        <div className="flex flex-col" style={{ gap: isAuth16 ? 8 : 16 }}>
          {title && (
            <TitleTag
              className={cn('font-bold', isAuth16 && 'text-center', isAuth16 && styles.auth16Title)}
              style={{
                fontSize: isAuth16 ? 27 : 28,
                ...(isAuth16 ? { margin: 0 } : { lineHeight: 1.4 }),
              }}
            >
              {title}
            </TitleTag>
          )}
          {subtitle && (
            <SubtitleTag
              className={cn(
                'text-muted-foreground',
                isAuth16 && 'text-center font-normal',
                !isAuth16 && 'font-medium',
                isAuth16 && styles.auth16Subtitle,
              )}
              style={{
                color: isAuth16 ? 'var(--muted-foreground)' : undefined,
                fontSize: isAuth16 ? 14 : 18,
                ...(isAuth16 ? { margin: 0 } : { lineHeight: 1.4 }),
              }}
            >
              {subtitle}
            </SubtitleTag>
          )}
        </div>
        <div
          className="flex flex-col"
          style={{ gap: isAuth16 ? 12 : 4, paddingBlock: isAuth16 ? 0 : 32 }}
        >
          {children}
        </div>
        {footer}
      </div>
    );
  },
);

export default AuthCard;
