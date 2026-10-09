import { cn } from 'cn';

/**
 * Disclosure chevron for a collapsible trigger. It turns with the nearest
 * Base UI `CollapsibleTrigger` (`data-panel-open`), so it needs no `open` prop
 * and can never disagree with `aria-expanded`.
 */
export default function SidebarCollapseIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 16 16"
      className={cn(
        'size-4 shrink-0 opacity-60 transition-transform duration-200 in-data-panel-open:rotate-90',
        className,
      )}
    >
      <path d="M7.00194 10.6239C6.66861 10.8183 6.25 10.5779 6.25 10.192V5.80802C6.25 5.42212 6.66861 5.18169 7.00194 5.37613L10.7596 7.56811C11.0904 7.76105 11.0904 8.23895 10.7596 8.43189L7.00194 10.6239Z" />
    </svg>
  );
}
