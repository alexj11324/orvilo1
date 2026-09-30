'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo } from 'react';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    align-self: flex-start;

    width: calc(50% - 4px);
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};

    @container (max-width: 840px) {
      width: '100%';
    }
  `,
  fullWidth: css`
    width: '100%';
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
  `,
}));

interface WorkspaceAgentPolicyCardProps {
  action?: ReactNode;
  children?: ReactNode;
  fullWidth?: boolean;
  icon: LucideIcon;
  title: ReactNode;
}

export const WorkspaceAgentPolicyCard = memo<WorkspaceAgentPolicyCardProps>(
  ({ action, children, fullWidth, icon, title }) => (
    <div className={cn('flex flex-col gap-3', cx(styles.card, fullWidth && styles.fullWidth))}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {createElement(icon, { size: 16 })}
          <div className={styles.title}>{title}</div>
        </div>
        {action}
      </div>
      {children}
    </div>
  ),
);

WorkspaceAgentPolicyCard.displayName = 'WorkspaceAgentPolicyCard';
