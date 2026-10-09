import { Link2Icon, LockKeyholeIcon } from 'lucide-react';
import React, { memo } from 'react';

import Avatar from '@/components/Avatar';
import { ProductLogo } from '@/components/Branding';

interface OAuthApplicationLogoProps {
  clientDisplayName: string;
  isFirstParty?: boolean;
  logoUrl?: string;
  size?: number;
}

const OAuthApplicationLogo = memo<OAuthApplicationLogoProps>(
  ({ isFirstParty, clientDisplayName, logoUrl, size = 72 }) => {
    return isFirstParty ? (
      <Avatar alt={clientDisplayName} avatar={logoUrl!} shape={'square'} size={size} />
    ) : (
      <div className="flex items-center gap-2 justify-center">
        {logoUrl ? (
          <Avatar alt={clientDisplayName} avatar={logoUrl} size={size} />
        ) : (
          <LockKeyholeIcon size={size} />
        )}
        <div className="h-px w-6 bg-sidebar-border" />
        <div className="flex size-10 flex-col items-center justify-center [@media(width<=768px)]:size-8">
          <Link2Icon className="text-xl leading-[inherit] text-muted-foreground" />
        </div>
        <div className="h-px w-6 bg-sidebar-border" />
        <ProductLogo size={size} />
      </div>
    );
  },
);

export default OAuthApplicationLogo;
