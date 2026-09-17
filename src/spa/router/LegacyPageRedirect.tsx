'use client';

import { Navigate, useParams } from 'react-router';

interface LegacyPageRedirectProps {
  permission?: boolean;
}

const LegacyPageRedirect = ({ permission = false }: LegacyPageRedirectProps) => {
  const { id, workspaceSlug } = useParams<{ id: string; workspaceSlug?: string }>();
  const prefix = workspaceSlug ? `/${workspaceSlug}` : '';
  if (!id) return <Navigate replace to={`${prefix}/resource`} />;
  const target = permission
    ? `${prefix}/resource/documents/${encodeURIComponent(id)}/permission`
    : `${prefix}/resource?file=${encodeURIComponent(id)}`;
  return <Navigate replace to={target} />;
};

export default LegacyPageRedirect;
