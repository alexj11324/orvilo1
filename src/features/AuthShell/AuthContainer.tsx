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
          <AuthLangButton />
          <AuthThemeButton size={18} />
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
