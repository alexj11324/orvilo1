import { clsx } from 'cn';

import nativeStyles from './GlobalApprovalNotification.module.css';

export const styles = {
  actions:
    'pbs-2 pbe-3 px-3 border-bs border-divider bg-[color-mix(in_srgb,var(--popover)_92%,var(--selected))] empty:hidden',
  card: 'pointer-events-auto flex w-full flex-col overflow-hidden rounded-(--radius-overlay) border border-divider bg-popover shadow-(--shadow-popover)',
  content: 'min-h-0 max-h-[42vh] flex-1 overflow-y-auto pbs-1.5 pbe-2 px-3',
  header: 'flex items-center gap-2 px-3 py-2',
  headerMeta: 'min-w-0 flex-1 overflow-hidden',
  headerSubtitle: clsx(
    'flex items-baseline gap-2 overflow-hidden text-xs text-foreground-tertiary text-ellipsis whitespace-nowrap',
    nativeStyles.headerSubtitle,
  ),
  headerTitle: 'text-base font-semibold text-foreground [overflow-wrap:anywhere]',
  moreHint: 'pointer-events-auto self-center py-0.5 text-xs text-foreground-tertiary',
  pill: 'pointer-events-auto flex h-9 cursor-pointer items-center gap-2 rounded-full border border-divider bg-popover px-3.5 text-sm text-foreground shadow-(--shadow-popover)',
  pillDot: 'size-1.75 shrink-0 rounded-full bg-primary',
  stack: 'flex w-full flex-col gap-2.5',
  requestContext: 'flex flex-col gap-2 border-be border-divider pbs-1 pbe-3 px-3',
  userRequestBody: clsx('max-h-30 overflow-y-auto', nativeStyles.userRequestBody),
  wrapper:
    'pointer-events-none fixed z-1000 inset-bs-[var(--global-approval-top,calc(var(--spacing)*4))] start-1/2 flex w-[min(calc(var(--spacing)*160),92vw)] -translate-x-1/2 flex-col items-center rtl:translate-x-1/2',
};
