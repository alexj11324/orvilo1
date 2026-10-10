'use client';

import type { LucideIcon } from 'lucide-react';
import { memo } from 'react';

/**
 * Shared with the dropdown-style widgets (locale / workspace role), whose
 * trigger has to be a plain element instead of a `<button>` with `onClick`.
 */
export const barButtonStyles = {
  button:
    'cursor-pointer inline-flex shrink-0 gap-1 items-center h-8 px-1 border-0 rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground whitespace-nowrap bg-transparent hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
};

interface BarButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  title?: string;
}

const BarButton = memo<BarButtonProps>(({ icon: Icon, label, onClick, title }) => (
  <button className={barButtonStyles.button} title={title} type={'button'} onClick={onClick}>
    <Icon size={11} />
    <span>{label}</span>
  </button>
));

BarButton.displayName = 'DevDockBarButton';

export default BarButton;
