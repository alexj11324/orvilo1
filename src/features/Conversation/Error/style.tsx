import { Avatar } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { type ComponentProps, type ReactNode } from 'react';
import { memo } from 'react';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    border: 1px solid ${cssVar.colorSplit};
    border-radius: 8px;
    color: ${cssVar.colorText};
    background: ${cssVar.colorBgContainer};
  `,
  desc: css`
    color: ${cssVar.colorTextTertiary};
    text-align: center;
  `,
  form: css`
    width: 100%;
    max-width: 360px;

    @media (width <= 768px) {
      max-width: 90%;
    }
  `,
}));

type CenterProps = ComponentProps<'div'> & {
  gap?: number | string;
  padding?: number | string;
};

export const ErrorActionContainer = memo<CenterProps>(
  ({ children, className, gap = 24, padding = 24, ...rest }) => {
    return (
      <div
        className={cn('flex items-center justify-center', cx(styles.container, className))}
        style={{ gap, padding }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

export const FormAction = memo<
  {
    animation?: boolean;
    avatar: ReactNode;
    background?: string;
    description: string;
    title: string;
  } & CenterProps
>(
  ({
    children,
    background,
    title,
    description,
    avatar,
    animation,
    className,
    gap = 16,
    ...rest
  }) => {
    return (
      <div
        className={cn('flex items-center justify-center', cx(styles.form, className))}
        style={{ gap }}
        {...rest}
      >
        <Avatar
          animation={animation}
          avatar={avatar}
          background={background ?? cssVar.colorFillContent}
          shape={'square'}
          size={80}
        />
        <div className="flex flex-col gap-2" style={{ width: '100%' }}>
          <div
            className="flex flex-col"
            style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}
          >
            {title}
          </div>
          <div className={cn('flex flex-col', styles.desc)}>{description}</div>
        </div>
        {children}
      </div>
    );
  },
);
