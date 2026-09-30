import { cssVar } from 'antd-style';
import { type LucideIcon } from 'lucide-react';
import { createElement, memo } from 'react';

export interface ItemCardProps {
  // Optional so white-label deployments can omit an entry entirely by leaving
  // the corresponding branding URL undefined (see AboutList, which filters
  // href-less items out before rendering).
  href?: string;
  icon?: LucideIcon;
  label: string;
  value: string;
}

const ItemCard = memo<ItemCardProps>(({ label, icon, href }) => {
  return (
    <a href={href} rel="noreferrer" style={{ color: 'inherit' }} target="_blank">
      <div className="flex cursor-pointer gap-3" style={{ paddingBlock: 12, paddingInline: 18 }}>
        {icon && createElement(icon, { fill: cssVar.colorText, size: 18 })}
        {label}
      </div>
    </a>
  );
});

export default ItemCard;
