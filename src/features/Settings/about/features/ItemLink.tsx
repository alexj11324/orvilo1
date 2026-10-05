import { cssVar } from 'antd-style';
import { type LucideIcon } from 'lucide-react';
import { SquareArrowOutUpRight } from 'lucide-react';
import { createElement, memo } from 'react';

export interface ItemLinkProps {
  // Optional: an omitted branding URL means "this deployment has no such
  // account", and AboutList drops the entry rather than rendering a dead link.
  href?: string;
  icon?: LucideIcon;
  label: string;
  value: string;
}

const ItemLink = memo<ItemLinkProps>(({ label, href }) => {
  return (
    <a href={href} rel="noreferrer" style={{ color: 'inherit' }} target="_blank">
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        {label}
        {createElement(SquareArrowOutUpRight, { color: cssVar.colorTextDescription, size: 14 })}
      </div>
    </a>
  );
});

export default ItemLink;
