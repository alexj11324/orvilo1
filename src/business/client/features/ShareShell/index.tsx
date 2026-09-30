'use client';

import { Text } from '@lobehub/ui/base-ui';
import { type ReactNode } from 'react';
import { Link } from 'react-router';

import { ProductLogo } from '@/components/Branding';
import Loading from '@/components/Loading/BrandTextLoading';
import ShareErrorView from '@/features/Share/ErrorView';

export interface ShareShellShareInfo {
  avatar?: ReactNode;
  editUrl?: string;
  isOwner?: boolean;
  openUrl?: string;
}

export interface ShareShellProps {
  aside?: ReactNode;
  children?: ReactNode;
  error?: unknown;
  loading?: boolean;
  share?: ShareShellShareInfo;
  title?: string | null;
}

export interface ShareHeroProps {
  avatar?: ReactNode;
  byline?: ReactNode;
  title?: string | null;
}

export const ShareHero = ({ avatar, byline, title }: ShareHeroProps) => (
  <div className="flex flex-col gap-2 px-6 pt-6 pb-4">
    {avatar}
    {title && (
      <Text as={'h1'} fontSize={24} style={{ margin: 0 }} weight={700}>
        {title}
      </Text>
    )}
    {byline && (
      <Text fontSize={12} type={'secondary'}>
        {byline}
      </Text>
    )}
  </div>
);

export default function ShareShell({ aside, children, error, loading }: ShareShellProps) {
  let body = children;
  if (error) body = <ShareErrorView error={error} />;
  else if (loading) body = <Loading debugId="share shell" />;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center p-3">
        <Link style={{ color: 'inherit' }} to="/">
          <ProductLogo size={32} />
        </Link>
      </div>
      <div className="flex flex-1" style={{ overflow: 'hidden' }}>
        <div className="flex flex-1 flex-col" style={{ overflow: 'hidden' }}>
          {body}
        </div>
        {aside}
      </div>
    </div>
  );
}
