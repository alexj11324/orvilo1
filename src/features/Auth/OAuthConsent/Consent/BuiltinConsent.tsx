'use client';

import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import BrandLoading from '@/components/Loading/BrandTextLoading';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

interface BuiltinConsentProps {
  uid: string;
}

const BuiltinConsent = memo<BuiltinConsentProps>(({ uid }) => {
  const { t } = useTranslation('oauth');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Auto-submit on mount
    formRef.current?.submit();
  }, []);

  return (
    <>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="default">{<BrandLoading debugId={'ouidc'} />}</EmptyMedia>
          <EmptyTitle>{<div className="text-[14px]">{t('consent.redirecting')}</div>}</EmptyTitle>
        </EmptyHeader>
      </Empty>
      <form action="/oidc/consent" method="post" ref={formRef} style={{ display: 'none' }}>
        <input name="uid" type="hidden" value={uid} />
        <input name="consent" type="hidden" value="accept" />
      </form>
    </>
  );
});

BuiltinConsent.displayName = 'BuiltinConsent';

export default BuiltinConsent;
