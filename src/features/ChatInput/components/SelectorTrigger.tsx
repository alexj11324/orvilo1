import { cn } from 'cn';
import { ChevronDownIcon, ZapIcon } from 'lucide-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { memo } from 'react';

import { Button } from '@/components/ui/button';

const styles = {
  label: 'overflow-hidden min-w-0 max-w-50 text-ellipsis whitespace-nowrap',
  secondary: 'flex-none text-[var(--ant-color-text-tertiary)] [transition:color_0.2s]',
  trigger:
    "cursor-pointer flex flex-initial gap-1.5 items-center min-w-0 max-w-full h-7 px-2 border-0 rounded-(--radius-input) text-xs [font-weight:inherit] text-muted-foreground whitespace-nowrap bg-transparent bg-none [transition:all_0.2s] hover:text-foreground hover:bg-selected hover:bg-none hover:[&_[data-secondary]]:text-muted-foreground [&[aria-expanded='true']]:text-foreground [&[aria-expanded='true']]:bg-selected [&[aria-expanded='true']]:bg-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-muted-foreground focus-visible:outline-offset-2",
};

/**
 * The chip the composer selectors open from — the agent picker, the
 * heterogeneous one and the standard model + reasoning-effort one. The label
 * already names the selection, so an icon would only add noise next to Send;
 * `leading` exists for chips whose identity is visual (the agent avatar).
 *
 * The chip reads as two halves, the way the Codex composer does ("5.6 Sol 极高"):
 * `text` is the model, `secondaryText` the reasoning effort. Only the model half
 * may be ellipsised; the effort half never shrinks, so a long model name can
 * no longer push the effort out of view, and it renders a step dimmer so the
 * two values scan as name + qualifier instead of one run-on label.
 * The trigger can shrink with its send area on narrow panels; only the model
 * label gives up width so the effort and adjacent Send control remain visible.
 *
 * `DropdownMenuTrigger` clones its child to inject the open handler, ref and
 * `aria-haspopup`/`aria-expanded`. Swallowing the rest props here leaves a
 * chip that renders correctly and never opens, so they must reach the element.
 */
interface TriggerProps extends ComponentPropsWithRef<'button'> {
  ariaLabel: string;
  fast?: boolean;
  /** Optional leading visual (e.g. the agent avatar) rendered before the label. */
  leading?: ReactNode;
  secondaryText?: string;
  text: string;
}

const SelectorTrigger = memo<TriggerProps>(
  ({ ariaLabel, className, fast, leading, secondaryText, text, type = 'button', ...rest }) => (
    <Button
      {...rest}
      aria-label={ariaLabel}
      className={cn(styles.trigger, className)}
      size="sm"
      type={type}
      variant="ghost"
    >
      {leading}
      {fast && (
        <span className="anticon" role="img">
          <ZapIcon className="size-3" fill={'transparent'} height={12} size={12} width={12} />
        </span>
      )}
      <span className={styles.label}>{text}</span>
      {secondaryText && (
        <span data-secondary className={styles.secondary}>
          {secondaryText}
        </span>
      )}
      <span className="anticon" role="img">
        <ChevronDownIcon className="size-3" fill={'transparent'} height={12} size={12} width={12} />
      </span>
    </Button>
  ),
);

SelectorTrigger.displayName = 'SelectorTrigger';

export default SelectorTrigger;
