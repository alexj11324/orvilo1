import { Alert, Button, Result } from '@lobehub/ui/base-ui';
import { ShieldAlert } from 'lucide-react';
import React, { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Balancer from 'react-wrap-balancer';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { GITHUB_ISSUES } from '@/const/url';
import { githubService } from '@/services/github';
import { type ErrorShape } from '@/types/importer';

interface ErrorProps {
  error?: ErrorShape;
  onClick: () => void;
}

const Error = memo<ErrorProps>(({ error, onClick }) => {
  const { t } = useTranslation('common');
  return (
    <Result
      icon={<ShieldAlert />}
      status={'error'}
      style={{ paddingBlock: 24, width: 450 }}
      title={t('importModal.error.title')}
      extra={
        <div className="flex flex-col gap-3" style={{ textAlign: 'start' }}>
          <Alert
            extra={<CodeBlock code={JSON.stringify(error, null, 2)} language="json" />}
            style={{ flex: 1 }}
            title={error?.message}
            type={'error'}
          />
          <Button onClick={onClick}>{t('close')}</Button>
        </div>
      }
      subTitle={
        <Balancer>
          <Trans
            i18nKey="importModal.error.desc"
            ns={'common'}
            components={[
              <span key="0" />,
              <a
                aria-label={'issue'}
                href={GITHUB_ISSUES}
                key="1"
                rel="noreferrer"
                target="_blank"
                onClick={(e) => {
                  e.preventDefault();
                  githubService.submitImportError(error!);
                }}
              />,
            ]}
          />
        </Balancer>
      }
    />
  );
});

export default Error;
