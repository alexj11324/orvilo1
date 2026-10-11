'use client';

import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { type ComponentProps, memo, type ReactNode } from 'react';

import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

const styles = {
  more: 'flex items-center text-sm leading-5.5 text-muted-foreground',
  title: 'my-[0.2em] font-semibold',
  title2: 'text-xl',
  title3: 'text-base',
};

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
      <h2 className={cn(styles.title, styles[`title${level}` as 'title2' | 'title3'])} id={id}>
        {children}
      </h2>
    );

    const moreLinkElement = moreLink ? (
      moreLink.startsWith('http') ? (
        <a className={styles.more} href={moreLink} rel="noreferrer" target="_blank">
          <span className="me-1">{more}</span>
          <ChevronRight size={16} />
        </a>
      ) : (
        <WorkspaceLink className={styles.more} to={moreLink}>
          <span className="me-1">{more}</span>
          <ChevronRight size={16} />
        </WorkspaceLink>
      )
    ) : null;

    return (
      <div className="flex w-full items-center gap-4 justify-between" {...rest}>
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
