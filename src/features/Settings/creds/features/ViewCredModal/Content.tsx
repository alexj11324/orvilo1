'use client';

import { type OwnCredSummary } from '@orvilo/types';
import { useQuery } from '@tanstack/react-query';
import { cx } from 'antd-style';
import { CircleAlert, Eye, EyeOff, Info, TriangleAlert } from 'lucide-react';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CopyButton from '@/components/CopyButton';
import { ArticleSkeleton } from '@/components/Skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { type CredsApi } from '../useCredsApi';

const maskValue = (value: string): string => {
  if (value.length <= 4) return '••••••••';
  return '••••••••' + value.slice(-4);
};

interface KVRowProps {
  keyName: string;
  value: string;
}

const KVRow: FC<KVRowProps> = ({ keyName, value }) => {
  const { t } = useTranslation('auth');
  const [visible, setVisible] = useState(false);

  return (
    <div className="mb-2 flex items-stretch rounded-lg border border-border last:mb-0">
      <div
        className={
          'min-w-35 rounded-l-lg bg-muted/50 px-3 py-2 font-mono text-[13px] text-muted-foreground'
        }
      >
        {keyName}
      </div>
      <div
        className={
          'flex flex-1 items-center justify-between gap-2 rounded-r-lg bg-card px-3 py-2 font-mono text-[13px]'
        }
      >
        <span
          className={cx(!visible && 'text-muted-foreground tracking-widest')}
          style={{
            flex: 1,
            fontSize: 13,
            wordBreak: 'break-all',
          }}
        >
          {visible ? value : maskValue(value)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            aria-label={visible ? t('apikey.display.hide') : t('apikey.display.show')}
            className="text-muted-foreground"
            size="icon-sm"
            variant="ghost"
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
          <CopyButton content={value} size="small" title={t('copy', { ns: 'common' })} />
        </div>
      </div>
    </div>
  );
};

export interface ViewCredModalContentProps {
  cred: OwnCredSummary;
  /**
   * Bound explicitly by the caller (rendered inline, inside CredsApiProvider)
   * instead of read via useCredsApi() here — this content tree is portaled by
   * createModal() to a global ModalHost that sits outside CredsApiProvider,
   * so a local useCredsApi() call would silently fall back to the personal
   * (creds) API even on the workspace creds page.
   */
  credsApi: CredsApi;
}

const ViewCredModalContent: FC<ViewCredModalContentProps> = ({ cred, credsApi }) => {
  const { t } = useTranslation('setting');

  const { data, isLoading, error } = useQuery({
    queryFn: () =>
      credsApi.client.get.query({
        decrypt: true,
        id: cred.id,
      }),
    queryKey: ['cred-plaintext', cred.id],
  });

  const values = data?.data?.plaintext || {};
  const valueEntries = Object.entries(values);

  if (isLoading) {
    return <ArticleSkeleton rows={3} />;
  }

  if (error) {
    return (
      <Alert className="my-4" variant="destructive">
        <CircleAlert />
        <AlertTitle>{t('creds.view.error')}</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Alert className="my-4" variant="warning">
        <TriangleAlert />
        <AlertDescription>{t('creds.view.warning')}</AlertDescription>
      </Alert>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 rounded-lg border border-border p-3 text-sm">
        <dt className="text-muted-foreground">{t('creds.table.name')}</dt>
        <dd>{cred.name}</dd>
        <dt className="text-muted-foreground">{t('creds.table.key')}</dt>
        <dd>
          <code>{cred.key}</code>
        </dd>
        <dt className="text-muted-foreground">{t('creds.table.type')}</dt>
        <dd>{cred.type ? t(`creds.types.${cred.type}` as any) : '-'}</dd>
      </dl>

      {valueEntries.length > 0 && (
        <div className="mt-4">
          <div className="mb-3 font-medium">{t('creds.view.values')}</div>
          {valueEntries.map(([key, value]) => (
            <KVRow key={key} keyName={key} value={String(value)} />
          ))}
        </div>
      )}

      {valueEntries.length === 0 && cred.type === 'oauth' && (
        <Alert className="my-4" variant="info">
          <Info />
          <AlertTitle>{t('creds.view.noValues')}</AlertTitle>
          <AlertDescription>{t('creds.view.oauthNote')}</AlertDescription>
        </Alert>
      )}
    </>
  );
};

export default ViewCredModalContent;
