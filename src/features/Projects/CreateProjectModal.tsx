import { createModal } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { lazy, Suspense } from 'react';

import type { CreateProjectOptions } from './CreateProjectContent';

const CreateProjectContent = lazy(() => import('./CreateProjectContent'));
const CreateProjectTitle = lazy(() =>
  import('./CreateProjectContent').then((m) => ({ default: m.CreateProjectTitle })),
);

const styles = createStaticStyles(({ css }) => ({
  popup: css`
    > div {
      border-radius: 21px;
    }
  `,
}));

export const openCreateProjectModal = (options: CreateProjectOptions = {}) =>
  createModal({
    classNames: { popup: styles.popup },
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
