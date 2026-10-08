import { ShieldAlert } from 'lucide-react';
import React, { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Balancer from 'react-wrap-balancer';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
    <Empty style={{ paddingBlock: 24, width: 450 }}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldAlert className="text-destructive" />
        </EmptyMedia>
        <EmptyTitle>{t('importModal.error.title')}</EmptyTitle>
        <EmptyDescription>
          <Balancer>
            <Trans
              i18nKey="importModal.error.desc"
              ns={'common'}
              components={[
                <span key="0" />,
                <a
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
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-col gap-3" style={{ textAlign: 'start' }}>
          <Alert style={{ flex: 1 }} variant="destructive">
            <AlertTitle>{error?.message}</AlertTitle>
            <AlertAction>
              <CodeBlock code={JSON.stringify(error, null, 2)} language="json" />
            </AlertAction>
          </Alert>
          <Button onClick={onClick}>{t('close')}</Button>
        </div>
      </EmptyContent>
    </Empty>
  );
});

export default Error;
