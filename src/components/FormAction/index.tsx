import { cn } from 'cn';
import { type HTMLAttributes, type ReactNode } from 'react';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

export const styles = {
  container: 'rounded-(--radius-card) border border-divider bg-card text-foreground',
  desc: 'text-center text-sm leading-5.5 text-foreground-tertiary',
  form: 'w-full max-w-160',
};

const FormAction = memo<
  {
    animation?: boolean;
    avatar: ReactNode;
    background?: string;
    description: ReactNode;
    gap?: number;
    title: string;
  } & HTMLAttributes<HTMLDivElement>
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
        className={cn('flex items-center justify-center', styles.form, className)}
        style={{ gap }}
        {...rest}
      >
        <Avatar
          animation={animation}
          avatar={avatar}
          background={background ?? 'var(--muted)'}
          size={80}
        />
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col text-center text-xl leading-7 font-semibold">{title}</div>
          <div className={cn('flex', styles.desc)}>{description}</div>
        </div>
        {children}
      </div>
    );
  },
);

export default FormAction;
