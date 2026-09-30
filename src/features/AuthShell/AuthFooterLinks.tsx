'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { PRIVACY_URL, TERMS_URL } from '@/const/url';

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
  return (
    <div className="text-center text-[13px] text-muted-foreground">
      <a className={styles.link} href={TERMS_URL} rel="noopener noreferrer" target="_blank">
        {t('footer.terms')}
      </a>
      <span style={{ marginInline: 8 }}>·</span>
      <a className={styles.link} href={PRIVACY_URL} rel="noopener noreferrer" target="_blank">
        {t('footer.privacy')}
      </a>
    </div>
  );
});

export default AuthFooterLinks;
