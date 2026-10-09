import { cn } from 'cn';

/**
 * `raised` is the chip for surfaces that already use the muted wash (sidebar search button,
 * menu rows). `bg-muted` equals `--sidebar-accent` there and the chip would disappear, so
 * both call sites share this one token instead of overriding the background locally.
 */
function Kbd({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'kbd'> & { variant?: 'default' | 'raised' }) {
  return (
    <kbd
      data-slot="kbd"
      data-variant={variant}
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        variant === 'raised' && 'bg-sidebar-border text-sidebar-foreground',
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <kbd
      className={cn('inline-flex items-center gap-1', className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
