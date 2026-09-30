import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { type HTMLAttributes, type ReactNode } from 'react';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

export const styles = createStaticStyles(({ css }) => ({
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
    max-width: 300px;
  `,
}));

const FormAction = memo<
  {
    animation?: boolean;
    avatar: ReactNode;
    background?: string;
    description: ReactNode;
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
        className={cn('flex items-center justify-center', cx(styles.form, className))}
        style={{ gap }}
        {...rest}
      >
        <Avatar
          animation={animation}
          avatar={avatar}
          background={background ?? cssVar.colorFillContent}
          size={80}
        />
        <div className={'flex flex-col gap-2'} style={{ width: '100%' }}>
          <div
            className={'flex flex-col'}
            style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}
          >
            {title}
          </div>
          <div className={cn('flex', styles.desc)}>{description}</div>
        </div>
        {children}
      </div>
    );
  },
);

export default FormAction;
