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
    <a href={href} rel="noreferrer" target="_blank">
      <div className="flex cursor-pointer gap-3 px-4 py-3 text-sm leading-5.5 text-foreground">
        {icon &&
          createElement(icon, { className: 'text-foreground', fill: 'currentColor', size: 18 })}
        {label}
      </div>
    </a>
  );
});

export default ItemCard;
