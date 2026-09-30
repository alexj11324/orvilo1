import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CheckIcon } from 'lucide-react';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

import type { SwitcherItem } from './switcherItems';

const styles = createStaticStyles(({ css, cssVar }) => ({
  current: css`
    background: ${cssVar.colorFillTertiary};
  `,
  row: css`
    cursor: pointer;

    overflow: hidden;
    flex: none;

    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface SwitcherRowProps {
  active?: boolean;
  item: SwitcherItem;
  onSelect: (id: string) => void;
  privateLabel?: string;
}

const SwitcherRow = memo<SwitcherRowProps>(({ active, item, onSelect, privateLabel }) => (
  <div
    className={cx(
      active ? `${styles.row} ${styles.current}` : styles.row,
      'flex h-[36px] flex-none cursor-pointer items-center gap-2',
    )}
    onClick={() => onSelect(item.id)}
  >
    <Avatar avatar={item.avatar} background={item.background} shape={'square'} size={28} />
    <div
      className="truncate font-[active ? 500 : undefined]"
      style={{ flex: 1, color: active ? cssVar.colorText : cssVar.colorTextSecondary }}
    >
      {item.title}
      {item.subtitle && (
        <span style={{ fontSize: 12, marginInlineStart: 6, opacity: 0.6 }}>{item.subtitle}</span>
      )}
    </div>
    {item.private && privateLabel && (
      <div className="text-[12px]" style={{ color: cssVar.colorTextTertiary }}>
        {privateLabel}
      </div>
    )}
    {active && <CheckIcon color={cssVar.colorText} size={14} />}
  </div>
));

SwitcherRow.displayName = 'SwitcherRow';

export default SwitcherRow;
