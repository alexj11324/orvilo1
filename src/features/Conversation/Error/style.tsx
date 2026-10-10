import { cn } from 'cn';
import { type ComponentProps, type ReactNode } from 'react';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

export const styles = {
  container: 'rounded-(--radius-card) border border-(--ant-color-split) bg-card text-foreground',
  desc: 'text-center text-(--ant-color-text-tertiary)',
  form: 'w-full max-w-90 [@media(width<=768px)]:max-w-[90%]',
};

type CenterProps = ComponentProps<'div'> & {
  gap?: number | string;
  padding?: number | string;
};

export const ErrorActionContainer = memo<CenterProps>(
  ({ children, className, gap = 24, padding = 24, ...rest }) => {
    return (
      <div
        className={cn('flex flex-col items-center justify-center', styles.container, className)}
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
        className={cn('flex flex-col items-center justify-center', styles.form, className)}
        style={{ gap }}
        {...rest}
      >
        <Avatar
          animation={animation}
          avatar={avatar}
          background={background ?? 'var(--ant-color-fill-content)'}
          shape={'square'}
          size={80}
        />
        <div className="flex flex-col gap-2" style={{ width: '100%' }}>
          <div
            className="flex flex-col"
            style={{ fontSize: 18, fontWeight: 600, textAlign: 'center' }}
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
