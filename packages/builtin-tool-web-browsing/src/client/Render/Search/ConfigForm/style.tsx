import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

export const styles = {
  container: 'rounded-(--radius-card) text-foreground',
  desc: 'text-(--ant-color-text-tertiary) text-center',
  form: 'w-full max-w-[300px] [padding-block:12px]',
};

export const FormAction = memo<
  {
    animation?: boolean;
    avatar: ReactNode;
    background?: string;
    description: string;
    gap?: number;
    title: string;
  } & ComponentProps<'div'>
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
        className={cn('flex flex-col items-center justify-center', cn(styles.form, className))}
        style={{ gap }}
        {...rest}
      >
        <Avatar
          animation={animation}
          avatar={avatar}
          background={background ?? 'var(--ant-color-fill-content)'}
          size={80}
        />
        <div className="flex flex-col gap-2 w-[100%]">
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
