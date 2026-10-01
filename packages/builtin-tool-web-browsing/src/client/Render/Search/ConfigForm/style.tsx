import { createStaticStyles, cssVar, cx } from 'antd-style';
import type { ComponentProps, ReactNode } from 'react';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    border-radius: 8px;
    color: ${cssVar.colorText};
  `,
  desc: css`
    color: ${cssVar.colorTextTertiary};
    text-align: center;
  `,
  form: css`
    width: 100%;
    max-width: 300px;
    padding-block: 12px;
  `,
}));

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
        className={cx('flex flex-col items-center justify-center', cx(styles.form, className))}
        style={{ gap }}
        {...rest}
      >
        <Avatar
          animation={animation}
          avatar={avatar}
          background={background ?? cssVar.colorFillContent}
          size={80}
        />
        <div className="flex flex-col gap-2 w-[100%]">
          <div
            className="flex flex-col"
            style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}
          >
            {title}
          </div>
          <div className={cx('flex flex-col', styles.desc)}>{description}</div>
        </div>
        {children}
      </div>
    );
  },
);
