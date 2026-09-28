'use client';

import { type FlexboxProps } from '@lobehub/ui';
import { Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { type ReactNode } from 'react';
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

export interface AuthCardProps extends Omit<FlexboxProps, 'title'> {
  footer?: ReactNode;
  subtitle?: ReactNode;
  title?: ReactNode;
  variant?: AuthCardVariant;
}

export const AuthCard = memo<AuthCardProps>(
  ({ children, title, subtitle, footer, variant = 'default', ...rest }) => {
    const isAuth16 = variant === 'auth16';
    const { className, ...flexboxProps } = rest;

    return (
      <Flexbox
        className={cx(isAuth16 && styles.auth16Root, className)}
        gap={isAuth16 ? 24 : undefined}
        width={isAuth16 ? 'min(100%,384px)' : 'min(100%,440px)'}
        {...flexboxProps}
      >
        <Flexbox gap={isAuth16 ? 8 : 16}>
          {title && (
            <Text
              align={isAuth16 ? 'center' : undefined}
              as={isAuth16 ? 'h1' : undefined}
              className={isAuth16 ? styles.auth16Title : undefined}
              fontSize={isAuth16 ? 27 : 28}
              style={isAuth16 ? { margin: 0 } : { lineHeight: 1.4 }}
              weight={'bold'}
            >
              {title}
            </Text>
          )}
          {subtitle && (
            <Text
              align={isAuth16 ? 'center' : undefined}
              as={isAuth16 ? 'p' : undefined}
              className={isAuth16 ? styles.auth16Subtitle : undefined}
              color={isAuth16 ? 'var(--muted-foreground)' : undefined}
              fontSize={isAuth16 ? 14 : 18}
              style={isAuth16 ? { margin: 0 } : { lineHeight: 1.4 }}
              type={'secondary'}
              weight={isAuth16 ? 400 : 500}
            >
              {subtitle}
            </Text>
          )}
        </Flexbox>
        <Flexbox gap={isAuth16 ? 12 : 4} paddingBlock={isAuth16 ? 0 : 32}>
          {children}
        </Flexbox>
        {footer}
      </Flexbox>
    );
  },
);

export default AuthCard;
