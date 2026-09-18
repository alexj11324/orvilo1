import { createModal } from '@lobehub/ui/base-ui';
import { lazy, Suspense } from 'react';

const InviteTeammateContent = lazy(() => import('./InviteTeammateContent'));
const InviteTeammateTitle = lazy(() =>
  import('./InviteTeammateContent').then((m) => ({ default: m.InviteTeammateTitle })),
);

export interface OpenInviteTeammateOptions {
  /** Pre-select a project when inviting from inside a project surface. */
  defaultProjectIds?: string[];
}

export const openInviteTeammateModal = (options: OpenInviteTeammateOptions = {}) =>
  createModal({
    content: (
      <Suspense fallback={null}>
        <InviteTeammateContent defaultProjectIds={options.defaultProjectIds} />
      </Suspense>
    ),
    footer: null,
    styles: { content: { padding: 0 } },
    title: (
      <Suspense fallback={null}>
        <InviteTeammateTitle />
      </Suspense>
    ),
    width: 520,
  });
