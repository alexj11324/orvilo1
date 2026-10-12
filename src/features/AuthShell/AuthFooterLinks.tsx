'use client';

import { BRANDING_URL } from '@orvilo/business-const';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const styles = {
  link: 'cursor-pointer text-inherit visited:text-link-active pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-center',
};

const AuthFooterLinks = memo(() => {
  const { t } = useTranslation('auth');
  const { privacy, terms } = BRANDING_URL;

  // A deployment that publishes no legal pages has nothing to link to; the
  // footer is dropped rather than pointing at pages that do not exist.
  if (!terms && !privacy) return null;

  return (
    <div className="text-center text-xs leading-5 text-muted-foreground pointer-coarse:flex pointer-coarse:flex-wrap pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:gap-x-2">
      {terms && (
        <a className={styles.link} href={terms} rel="noopener noreferrer" target="_blank">
          {t('footer.terms')}
        </a>
      )}
      {terms && privacy && <span className="mx-2 pointer-coarse:mx-0">·</span>}
      {privacy && (
        <a className={styles.link} href={privacy} rel="noopener noreferrer" target="_blank">
          {t('footer.privacy')}
        </a>
      )}
    </div>
  );
});

export default AuthFooterLinks;
