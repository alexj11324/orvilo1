import { cn } from 'cn';
import { ArrowUp } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';

/** Native owner for the five plain-submit editor controls. Generation-stop and
 * split-menu controls have separate contracts and are not migrated through it. */
export type EditorSendButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'size'> & {
  'aria-label': string;
};

export function EditorSendButton({ className, onClick, loading, ...props }: EditorSendButtonProps) {
  return (
    <Button
      {...props}
      className={cn('rounded-full', className)}
      loading={loading}
      size="icon-lg"
      type="button"
      onClick={(event) => {
        // Keep submission in its current composer and avoid an ancestor form or
        // timeline click receiving the same action.
        event.stopPropagation();
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {!loading && <ArrowUp aria-hidden="true" />}
    </Button>
  );
}
