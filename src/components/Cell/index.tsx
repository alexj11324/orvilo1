import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { type LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { createElement, type ReactNode } from 'react';
import { memo } from 'react';

import Divider from './Divider';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    position: relative;
    border-radius: 0;
    font-size: 15px;

    &:active {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

export interface CellProps {
  icon?: LucideIcon;
  key?: string | number;
  label?: string | ReactNode;
  onClick?: () => void;
  type?: 'divider';
}

const Cell = memo<CellProps>(({ label, icon, onClick, type }) => {
  if (type === 'divider') return <Divider />;

  return (
    <div
      className={cn('flex gap-3 items-center justify-between p-4', cx(styles.container))}
      onClick={onClick}
    >
      <div className={'flex gap-3 items-center'}>
        {icon && createElement(icon, { size: 20, style: { color: cssVar.colorPrimaryBorder } })}
        {label}
      </div>
      {createElement(ChevronRight, { size: 16, style: { color: cssVar.colorBorder } })}
    </div>
  );
});

export default Cell;
