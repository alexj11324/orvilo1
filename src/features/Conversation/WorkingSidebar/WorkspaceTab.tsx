import { cn } from 'cn';
import type { LucideProps } from 'lucide-react';
import { PinIcon, XIcon } from 'lucide-react';
import { type ComponentType, createElement, memo, type ReactNode } from 'react';

import type { DropdownItem as ContextMenuItem } from '@/components/ItemsMenu';
import { ContextMenuTrigger } from '@/components/ItemsMenu';

const styles = {
  close:
    'cursor-pointer absolute inset-bs-1/2 end-1 -translate-y-1/2 grid place-items-center size-8 p-0 border-0 rounded-(--radius-button) text-foreground-tertiary opacity-0 bg-transparent transition-[opacity,color,background-color] duration-(--orvilo-motion-fast) hover:text-foreground hover:bg-accent focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring',
  container:
    'relative flex shrink-0 items-center rounded-(--radius-button) transition-colors duration-(--orvilo-motion-fast) hover:bg-accent hover:[&_[data-tab-close]]:opacity-100 focus-within:[&_[data-tab-close]]:opacity-100',
  containerActive: 'bg-selected hover:bg-selected',
  pinned:
    'pointer-events-none absolute inset-bs-1/2 end-2 -translate-y-1/2 grid place-items-center text-muted-foreground',
  label: 'overflow-hidden max-w-40 text-ellipsis',
  tab: 'cursor-pointer min-h-8 py-1 px-2.5 border-0 rounded-(--radius-button) text-sm leading-5.5 text-foreground-tertiary whitespace-nowrap bg-transparent transition-colors duration-(--orvilo-motion-fast) hover:text-foreground aria-pressed:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2',
  tabClosable: 'pe-10',
  trigger: 'flex gap-1 items-center',
};

interface WorkspaceTabProps {
  active: boolean;
  closeLabel?: string;
  contextMenuItems?: ContextMenuItem[];
  icon: ComponentType<LucideProps>;
  iconNode?: ReactNode;
  label: ReactNode;
  onClose?: () => void;
  onSelect: () => void;
  pinned?: boolean;
  pinnedLabel?: string;
  tabKey: string;
}

const WorkspaceTab = memo<WorkspaceTabProps>(
  ({
    active,
    closeLabel,
    contextMenuItems,
    icon,
    iconNode,
    label,
    onClose,
    onSelect,
    pinned,
    pinnedLabel,
    tabKey,
  }) => {
    const content = (
      <div
        className={cn(styles.container, active && styles.containerActive)}
        data-pinned={pinned ? 'true' : undefined}
      >
        <button
          aria-pressed={active}
          className={cn(styles.tab, (onClose || pinned) && styles.tabClosable)}
          data-tab-key={tabKey}
          type="button"
          onClick={onSelect}
        >
          <span className={styles.trigger}>
            {iconNode ?? createElement(icon, { size: 16 })}
            <span className={styles.label}>{label}</span>
          </span>
        </button>
        {pinned ? (
          <span aria-label={pinnedLabel} className={styles.pinned} role="img">
            <PinIcon size={12} />
          </span>
        ) : onClose ? (
          <button
            data-tab-close
            aria-label={closeLabel}
            className={styles.close}
            type="button"
            onClick={onClose}
          >
            <XIcon className="size-4" size={16} />
          </button>
        ) : null}
      </div>
    );

    return contextMenuItems ? (
      <ContextMenuTrigger items={contextMenuItems}>{content}</ContextMenuTrigger>
    ) : (
      content
    );
  },
);

WorkspaceTab.displayName = 'WorkingSidebarTab';

export default WorkspaceTab;
