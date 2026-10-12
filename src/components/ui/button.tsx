'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

import { useFormControlContext } from '@/components/FormControlContext';

import { Spinner } from './spinner';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-(--radius-button) border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-hover-foreground',
        // Retained antd resets anchors outside CSS layers; only link buttons need priority.
        outline:
          'border-border bg-background hover:bg-accent [&:is(a):hover]:bg-accent! hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-accent [&:is(a):hover]:bg-accent! hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        destructive:
          'bg-destructive-subtle text-destructive-text hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        link: 'text-primary-text hover:text-primary-text/80',
      },
      size: {
        'default':
          'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'compact':
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'xs': "h-6 gap-1 rounded-(--radius-input) px-2 text-xs in-data-[slot=button-group]:rounded-(--radius-button) has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        'sm': "h-7 gap-1 rounded-(--radius-input) px-2.5 text-xs in-data-[slot=button-group]:rounded-(--radius-button) has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        'normal':
          'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        // Existing normal controls use lg; large names the 40px role.
        'lg': 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'large':
          'h-10 gap-1.5 px-2.5 text-base has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        'icon': 'size-8',
        'icon-xs':
          "size-6 rounded-(--radius-input) in-data-[slot=button-group]:rounded-(--radius-button) [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-(--radius-input) in-data-[slot=button-group]:rounded-(--radius-button)',
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
  /** Keep the selected visual-size minimum while allowing a long label to wrap. */
  multiline?: boolean;
}

const multilineMinimumHeight: Record<
  NonNullable<VariantProps<typeof buttonVariants>['size']>,
  string
> = {
  'default': 'min-h-9',
  'compact': 'min-h-8',
  'xs': 'min-h-6',
  'sm': 'min-h-7',
  'normal': 'min-h-9',
  'lg': 'min-h-9',
  'large': 'min-h-10',
  'icon': 'min-h-8',
  'icon-xs': 'min-h-6',
  'icon-sm': 'min-h-7',
  'icon-lg': 'min-h-9',
};

function Button({
  className,
  variant = 'default',
  size,
  loading = false,
  multiline = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & ButtonLoadingProps) {
  const formControl = useFormControlContext();
  const resolvedSize =
    size === undefined
      ? formControl.size === 'small'
        ? 'sm'
        : formControl.size === 'large'
          ? 'large'
          : 'default'
      : size;

  return (
    <ButtonPrimitive
      aria-busy={loading || undefined}
      data-slot="button"
      disabled={(disabled ?? formControl.disabled) || loading}
      className={
        multiline
          ? cn(
              buttonVariants({ variant, size: resolvedSize }),
              size === undefined && formControl.size === 'small' && 'text-sm',
              multilineMinimumHeight[resolvedSize ?? 'default'],
              'h-auto whitespace-normal',
              className,
            )
          : cn(
              buttonVariants({ variant, size: resolvedSize }),
              size === undefined && formControl.size === 'small' && 'text-sm',
              className,
            )
      }
      {...props}
    >
      {loading ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, type ButtonLoadingProps, buttonVariants };
