'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { cn } from 'cn';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { FormControlProvider, useFormControlContext } from '@/components/FormControlContext';
import { Button } from '@/components/ui/button';
import { type InputVisualSize } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

import { POPUP_Z_CLASS } from './zIndex';

function Combobox<Value, Multiple extends boolean | undefined = false, Item = Value>({
  disabled,
  ...props
}: ComboboxPrimitive.Root.Props<Value, Multiple, Item>) {
  const formControl = useFormControlContext();
  const resolvedDisabled = disabled ?? formControl.disabled;

  return (
    <FormControlProvider disabled={resolvedDisabled}>
      <ComboboxPrimitive.Root disabled={resolvedDisabled} {...props} />
    </FormControlProvider>
  );
}

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({
  className,
  children,
  disabled,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  const formControl = useFormControlContext();

  return (
    <ComboboxPrimitive.Trigger
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      data-slot="combobox-trigger"
      disabled={disabled ?? formControl.disabled}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, disabled, ...props }: ComboboxPrimitive.Clear.Props) {
  const formControl = useFormControlContext();

  return (
    <ComboboxPrimitive.Clear
      className={cn(className)}
      data-slot="combobox-clear"
      disabled={disabled ?? formControl.disabled}
      render={<InputGroupButton size="icon-xs" variant="ghost" />}
      {...props}
    >
      <XIcon className="pointer-events-none" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxInput({
  className,
  children,
  disabled,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  const formControl = useFormControlContext();
  const resolvedDisabled = disabled ?? formControl.disabled;

  return (
    <InputGroup className={cn('w-auto', className)}>
      <ComboboxPrimitive.Input
        disabled={resolvedDisabled}
        render={<InputGroupInput />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            data-slot="input-group-button"
            disabled={resolvedDisabled}
            render={<ComboboxTrigger />}
            size="icon-xs"
            variant="ghost"
          />
        )}
        {showClear && <ComboboxClear disabled={resolvedDisabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 6,
  align = 'start',
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className={cn('isolate', POPUP_Z_CLASS)}
        side={side}
        sideOffset={sideOffset}
      >
        <ComboboxPrimitive.Popup
          data-chips={!!anchor}
          data-slot="combobox-content"
          className={cn(
            'group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-(--radius-overlay) bg-popover text-popover-foreground shadow-(--shadow-popover) ring-1 ring-foreground/10 duration-100 data-[chips=true]:min-w-(--anchor-width) data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-(--radius-button) py-1 pe-8 ps-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute inset-e-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group className={cn(className)} data-slot="combobox-group" {...props} />
  );
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      data-slot="combobox-label"
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      data-slot="combobox-separator"
      {...props}
    />
  );
}

const comboboxChipsSizeClasses: Record<InputVisualSize, string> = {
  default: 'min-h-9 text-sm',
  compact: 'min-h-8 text-sm',
  small: 'min-h-7 py-0.5 text-sm',
  normal: 'min-h-9 text-sm',
  large: 'min-h-10 text-base',
};

function ComboboxChips({
  className,
  visualSize,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
  ComboboxPrimitive.Chips.Props & {
    /** Minimum field height; selected values can wrap into additional rows. */
    visualSize?: InputVisualSize;
  }) {
  const formControl = useFormControlContext();
  const size =
    visualSize ??
    (formControl.size === 'small' ? 'small' : formControl.size === 'large' ? 'large' : 'default');

  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-(--radius-input) border border-input bg-transparent bg-clip-padding px-2.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 has-data-[slot=combobox-chip]:px-1 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40',
        comboboxChipsSizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  removeLabel,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
  /** Accessible name for the actual chip removal button; defaults to the current locale. */
  removeLabel?: string;
}) {
  const { t } = useTranslation('common');

  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'flex min-h-7 w-fit items-center justify-center gap-1 rounded-(--radius-chip) bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pe-0',
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <span className="inline-flex shrink-0 pointer-coarse:p-2">
          <ComboboxPrimitive.ChipRemove
            aria-label={removeLabel ?? t('remove')}
            className="relative opacity-50 hover:opacity-100 after:absolute after:hidden after:content-[''] pointer-coarse:after:block pointer-coarse:after:-inset-[calc(var(--spacing)*2.25)]"
            data-slot="combobox-chip-remove"
            render={<Button size="icon-sm" variant="ghost" />}
          >
            <XIcon className="pointer-events-none size-3.5" />
          </ComboboxPrimitive.ChipRemove>
        </span>
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({ className, disabled, ...props }: ComboboxPrimitive.Input.Props) {
  const formControl = useFormControlContext();

  return (
    <ComboboxPrimitive.Input
      className={cn('min-w-16 flex-1 outline-none', className)}
      data-slot="combobox-chip-input"
      disabled={disabled ?? formControl.disabled}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
};
