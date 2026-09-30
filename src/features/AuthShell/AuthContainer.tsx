'use client';

import '@/app/globals.css';

import { BRANDING_NAME } from '@orvilo/business-const';
import { cx } from 'antd-style';
import { type FC, type PropsWithChildren } from 'react';

import { ProductLogo } from '@/components/Branding';

import AuthFooterLinks from './AuthFooterLinks';
import AuthLangButton from './AuthLangButton';
import AuthThemeButton from './AuthThemeButton';
import { styles } from './style';

const AuthContainer: FC<PropsWithChildren> = ({ children }) => {
  return (
    <div className={cx(cx(styles.page, 'orvilo-entry-surface'), 'flex flex-col w-full')}>
      <header className={styles.header}>
        <a aria-label={BRANDING_NAME} className={styles.logoLink} href={'/'}>
          <ProductLogo size={36} type={'combine'} />
        </a>
        <div className={cx(styles.headerActions, 'flex items-center gap-1')}>
          <AuthLangButton />
          <AuthThemeButton size={18} />
        </div>
      </header>
      <main className={styles.main}>
        <div className="flex items-center justify-center w-full">{children}</div>
      </main>
      <footer className={styles.footer}>
        <AuthFooterLinks />
      </footer>
    </div>
  );
};

export default AuthContainer;
