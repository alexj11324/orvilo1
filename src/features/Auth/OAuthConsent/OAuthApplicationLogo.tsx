import { Avatar } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Link2Icon, LockKeyholeIcon } from 'lucide-react';
import React, { memo } from 'react';

import { ProductLogo } from '@/components/Branding';

const styles = createStaticStyles(({ css, cssVar }) => ({
  connector: css`
    width: 40px;
    height: 40px;

    @media (width <= 768px) {
      width: 32px;
      height: 32px;
    }
  `,
  connectorLine: css`
    width: 24px;
    height: 1px;
    background-color: ${cssVar.colorBorderSecondary};

    @media (width <= 768px) {
      width: 24px;
    }
  `,
}));

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
        <div className={styles.connectorLine} />
        <div className={cx(styles.connector, 'flex flex-col items-center justify-center')}>
          <Link2Icon style={{ color: cssVar.colorTextSecondary, fontSize: 20 }} />
        </div>
        <div className={styles.connectorLine} />
        <ProductLogo size={size} />
      </div>
    );
  },
);

export default OAuthApplicationLogo;
