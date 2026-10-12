'use client';

import { cn } from 'cn';
import { type PropsWithChildren } from 'react';
import { useSearchParams } from 'react-router';

import { settingWidthClassNames } from '@/features/Setting/settingWidth';

import ProviderMenu from '../ProviderMenu';

interface LayoutProps extends PropsWithChildren {
  onProviderSelect: (providerKey: string) => void;
}

const Layout = ({ children, onProviderSelect }: LayoutProps) => {
  const [searchParams] = useSearchParams();
  const provider = searchParams.get('provider');
  return (
    <div className={cn('mx-auto flex w-full flex-col', settingWidthClassNames.wide)}>
      {provider === 'all' || !provider ? (
        <ProviderMenu mobile={true} onProviderSelect={onProviderSelect} />
      ) : (
        children
      )}
    </div>
  );
};

export default Layout;
