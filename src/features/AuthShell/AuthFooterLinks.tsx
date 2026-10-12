'use client';

import { BRANDING_URL } from '@orvilo/business-const';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const styles = createStaticStyles(({ css, cssVar }) => ({
  link: css`
    cursor: pointer;
    color: inherit;

    &:visited {
      color: ${cssVar.colorLinkActive};
    }
  `,
}));

const AuthFooterLinks = memo(() => {
  const { t } = useTranslation('auth');
  const { privacy, terms } = BRANDING_URL;

  // A deployment that publishes no legal pages has nothing to link to; the
  // footer is dropped rather than pointing at pages that do not exist.
  if (!terms && !privacy) return null;

  return (
    <div className="text-center text-[13px] text-muted-foreground">
      {terms && (
        <a className={styles.link} href={terms} rel="noopener noreferrer" target="_blank">
          {t('footer.terms')}
        </a>
      )}
      {terms && privacy && <span style={{ marginInline: 8 }}>·</span>}
      {privacy && (
        <a className={styles.link} href={privacy} rel="noopener noreferrer" target="_blank">
          {t('footer.privacy')}
        </a>
      )}
    </div>
  );
});

export default AuthFooterLinks;
