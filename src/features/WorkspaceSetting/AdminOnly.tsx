'use client';

import { Ban } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsWorkspaceLoading } from '@/business/client/hooks/useIsWorkspaceLoading';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { Button } from '@/components/ui/button';
import { MAX_WIDTH } from '@/const/layoutTokens';
import { usePermission } from '@/hooks/usePermission';

const Forbidden = memo(() => {
  const { t } = useTranslation('error');
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100%',
        width: '100%',
      }}
    >
      <h1
        style={{
          filter: 'blur(8px)',
          fontSize: `min(${MAX_WIDTH / 3}px, 50vw)`,
          fontWeight: 'bolder',
          margin: 0,
          opacity: 0.12,
          position: 'absolute',
          zIndex: 0,
        }}
      >
        403
      </h1>
      <Ban size={64} strokeWidth={1.5} />
      <h2 style={{ fontWeight: 'bold', marginTop: '1em', textAlign: 'center' }}>
        {t('forbidden.title')}
      </h2>
      <div style={{ lineHeight: '1.8', marginBottom: '2em', textAlign: 'center' }}>
        {t('forbidden.desc')}
      </div>
      <Button variant="default" onClick={() => (window.location.href = '/')}>
        {t('forbidden.backHome')}
      </Button>
    </div>
  );
});

Forbidden.displayName = 'WorkspaceAdminOnlyForbidden';

const AdminOnly = memo<{ children: ReactNode }>(({ children }) => {
  const isLoading = useIsWorkspaceLoading();
  const { allowed: canManageWorkspace } = usePermission('manage_settings');

  // Don't paint the 403 before workspace context resolves — `myRole` is `null`
  // during bootstrap, which would briefly flash the forbidden screen for admins
  // landing directly on the URL.
  if (isLoading) return <RouteLoading />;
  if (!canManageWorkspace) return <Forbidden />;
  return <>{children}</>;
});

AdminOnly.displayName = 'WorkspaceAdminOnly';

export default AdminOnly;
