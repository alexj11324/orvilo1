'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { PRIVACY_URL, TERMS_URL } from '@/const/url';

const styles = {
  link: 'cursor-pointer text-inherit visited:text-link-active pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-center',
};

const AuthFooterLinks = memo(() => {
  const { t } = useTranslation('auth');
  return (
    <div className="text-center text-xs leading-5 text-muted-foreground pointer-coarse:flex pointer-coarse:flex-wrap pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:gap-x-2">
      <a className={styles.link} href={TERMS_URL} rel="noopener noreferrer" target="_blank">
        {t('footer.terms')}
      </a>
      <span className="mx-2 pointer-coarse:mx-0">·</span>
      <a className={styles.link} href={PRIVACY_URL} rel="noopener noreferrer" target="_blank">
        {t('footer.privacy')}
      </a>
    </div>
  );
});

export default AuthFooterLinks;
