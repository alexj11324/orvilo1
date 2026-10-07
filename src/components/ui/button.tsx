import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { createStaticStyles, cssVar } from 'antd-style';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

import { Spinner } from './spinner';

// Interactive roots that cannot be native buttons (nested actions or DnD)
// share the same semantic wash without inheriting Button sizing or layout.
const hoverStyles = createStaticStyles(({ css }) => ({
  feedback: css`
    border-radius: ${cssVar.borderRadius};

    &:not(:disabled, [aria-disabled='true'], [data-disabled]) {
      &:hover,
      &:focus-visible,
      &[aria-expanded='true'] {
        &:not([data-hover-paint='shadow']) {
          background: ${cssVar.colorFillTertiary};
        }

        &[data-hover-paint='shadow'] {
          box-shadow: 0 0 0 2px ${cssVar.colorFillSecondary};
        }

        &:is([aria-pressed='true'], [data-active='true']):not([data-hover-paint='shadow']) {
          background: ${cssVar.colorFillSecondary};
        }
      }
    }
  `,
}));
const buttonHoverFeedback = hoverStyles.feedback;

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: cn('text-primary hover:text-primary/80', buttonHoverFeedback),
      },
      size: {
        'default':
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'xs': "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        'sm': "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        'lg': 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'icon': 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

interface ButtonLoadingProps {
  /** Render a spinner before the children and disable the button while pending. */
  loading?: boolean;
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & ButtonLoadingProps) {
  return (
    <ButtonPrimitive
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonHoverFeedback, type ButtonLoadingProps, buttonVariants };
