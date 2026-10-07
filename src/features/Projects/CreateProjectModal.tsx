import { lazy, Suspense } from 'react';

import { createModal } from '@/components/Modal';

import type { CreateProjectOptions } from './CreateProjectContent';

const CreateProjectContent = lazy(() => import('./CreateProjectContent'));
const CreateProjectTitle = lazy(() =>
  import('./CreateProjectContent').then((m) => ({ default: m.CreateProjectTitle })),
);

export const openCreateProjectModal = (options: CreateProjectOptions = {}) =>
  createModal({
    content: (
      <Suspense fallback={null}>
        <CreateProjectContent {...options} />
      </Suspense>
    ),
    footer: null,
    styles: {
      content: { padding: 0, overflow: 'hidden' },
      header: { display: 'none' },
      close: { display: 'none' },
      backdrop: { background: 'rgba(0, 0, 0, 0.28)' },
    },
    title: (
      <Suspense fallback={null}>
        <CreateProjectTitle />
      </Suspense>
    ),
    width: 'min(920px, calc(100vw - 32px))',
  });
