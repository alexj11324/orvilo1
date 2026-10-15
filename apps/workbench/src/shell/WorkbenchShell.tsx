'use client';

// Retained @lobehub/ui components still toast through the base-ui host.
import { ToastHost as BaseToastHost } from '@lobehub/ui/base-ui';
import type { ResourceLanguage } from 'i18next';
import { memo, type PropsWithChildren } from 'react';

import { ModalHost } from '@/components/Modal';
import { ToastHost } from '@/components/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

import WorkbenchLocale from './WorkbenchLocale';
import WorkbenchTheme from './WorkbenchTheme';

interface WorkbenchShellProps extends PropsWithChildren {
  locale?: string;
  resources?: ResourceLanguage;
}

const WorkbenchShell = memo<WorkbenchShellProps>(({ children, resources, locale: localeProp }) => {
  const locale =
    localeProp ??
    (typeof document === 'undefined' ? 'en-US' : document.documentElement.lang || 'en-US');

  return (
    <WorkbenchLocale defaultLang={locale} resources={resources}>
      <WorkbenchTheme>
        <TooltipProvider>{children}</TooltipProvider>
        <BaseToastHost />
        <ModalHost />
        <ToastHost />
      </WorkbenchTheme>
    </WorkbenchLocale>
  );
});

WorkbenchShell.displayName = 'WorkbenchShell';

export default WorkbenchShell;
