'use client';

import '@/app/globals.css';

import { Center, Flexbox } from '@lobehub/ui';
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
    <Flexbox className={cx(styles.page, 'orvilo-entry-surface')} width={'100%'}>
      <header className={styles.header}>
        <a aria-label={BRANDING_NAME} className={styles.logoLink} href={'/'}>
          <ProductLogo size={36} type={'combine'} />
        </a>
        <Flexbox horizontal align={'center'} className={styles.headerActions} gap={4}>
          <AuthLangButton />
          <AuthThemeButton size={18} />
        </Flexbox>
      </header>
      <main className={styles.main}>
        <Center width={'100%'}>{children}</Center>
      </main>
      <footer className={styles.footer}>
        <AuthFooterLinks />
      </footer>
    </Flexbox>
  );
};

export default AuthContainer;
