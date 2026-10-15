'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { type FC, type PropsWithChildren } from 'react';

import { ProductLogo } from '@/components/Branding';

import AuthFooterLinks from './AuthFooterLinks';
import AuthLangButton from './AuthLangButton';
import AuthThemeButton from './AuthThemeButton';
import { EntryShell } from './EntryShell';
import { styles } from './style';

const AuthContainer: FC<PropsWithChildren> = ({ children }) => {
  return (
    <EntryShell
      footer={<AuthFooterLinks />}
      actions={
        <>
          <div className="flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:p-1.5">
            <AuthLangButton />
          </div>
          <div className="flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:p-1.5">
            <AuthThemeButton />
          </div>
        </>
      }
      brand={
        <a aria-label={BRANDING_NAME} className={styles.logoLink} href={'/'}>
          <ProductLogo size={40} type={'flat'} />
        </a>
      }
    >
      <div className="flex w-full flex-col items-center justify-center">{children}</div>
    </EntryShell>
  );
};

export default AuthContainer;
