import { cn } from 'cn';

import { ProductLogo } from '@/components/Branding';
import { Item, ItemMedia } from '@/components/ui/item';

interface LogoProps {
  className?: string;
}

function OrviloLogo({ className }: LogoProps) {
  return (
    <Item
      aria-hidden="true"
      className={cn(
        'p-0',
        'bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center',
        className,
      )}
    >
      <ItemMedia className="size-auto" variant="icon">
        <ProductLogo color="currentColor" size={16} type="mono" />
      </ItemMedia>
    </Item>
  );
}

export function Logo({ className }: LogoProps) {
  return (
    <span className={cn('relative flex size-7 shrink-0 items-center justify-center', className)}>
      <OrviloLogo className="absolute top-1/2 left-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.875]" />
    </span>
  );
}
