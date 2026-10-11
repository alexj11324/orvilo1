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
    <a href={href} rel="noreferrer" target="_blank">
      <div className="flex min-w-0 items-center gap-2 text-sm leading-5.5 text-foreground">
        {label}
        {createElement(SquareArrowOutUpRight, {
          className: 'text-foreground-description',
          size: 14,
        })}
      </div>
    </a>
  );
});

export default ItemLink;
