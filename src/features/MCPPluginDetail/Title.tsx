'use client';

import { createStaticStyles, cx } from 'antd-style';
import { ChevronRight } from 'lucide-react';
import { type ComponentProps, memo, type ReactNode } from 'react';

import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

const styles = createStaticStyles(({ css, cssVar }) => ({
  more: css`
    display: flex;
    align-items: center;
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    margin-block: 0.2em;
    font-weight: bold;
    line-height: 1.5;
  `,
  title2: css`
    font-size: 18px;
  `,
  title3: css`
    font-size: 16px;
  `,
}));

export interface TitleProps extends ComponentProps<'div'> {
  icon?: ReactNode;
  id?: string;
  level?: 2 | 3;
  more?: ReactNode;
  moreLink?: string;
  tag?: ReactNode;
}

const Title = memo<TitleProps>(
  ({ id, tag, children, moreLink, more, level = 2, icon, ...rest }) => {
    const title = (
      <h2 className={cx(styles.title, styles[`title${level}` as 'title2' | 'title3'])} id={id}>
        {children}
      </h2>
    );

    const moreLinkElement = moreLink ? (
      moreLink.startsWith('http') ? (
        <a className={styles.more} href={moreLink} rel="noreferrer" target="_blank">
          <span style={{ marginRight: 4 }}>{more}</span>
          <ChevronRight />
        </a>
      ) : (
        <WorkspaceLink className={styles.more} to={moreLink}>
          <span style={{ marginRight: 4 }}>{more}</span>
          <ChevronRight />
        </WorkspaceLink>
      )
    ) : null;

    return (
      <div className="flex items-center gap-4 justify-between" style={{ width: '100%' }} {...rest}>
        {tag || icon ? (
          <div className="flex items-center gap-2">
            {icon}
            {title}
            {tag && <div className="flex items-center gap-1">{tag}</div>}
          </div>
        ) : (
          title
        )}
        {moreLinkElement}
      </div>
    );
  },
);

Title.displayName = 'MCPPluginDetailTitle';

export default Title;
