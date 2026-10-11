import { cn } from 'cn';
import { type ComponentType, type CSSProperties } from 'react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MORE_FILE_PREVIEW_REQUEST_URL } from '@/const/url';
import { downloadFile } from '@/utils/client/downloadFile';

const styles = {
  page: 'w-full m-3 p-6 rounded-(--radius-card) bg-card shadow-(--shadow-raised)',
};

interface NotSupportProps {
  fileName?: string;
  style?: CSSProperties;
  url?: string | null;
}

const NotSupport: ComponentType<NotSupportProps> = ({ fileName, url, style }) => {
  const { t } = useTranslation('file');
  const [loading, setLoading] = useState(false);

  return (
    <div className={cn('flex flex-col', styles.page)} id="not-support-renderer" style={style}>
      <div className="flex flex-col items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <span className="text-[64px] leading-none">{'👀'}</span>
          <div className="flex flex-col text-center">
            <Trans
              i18nKey="preview.unsupportedFileAndContact"
              ns={'file'}
              components={[
                <span key="0" />,
                <a href={MORE_FILE_PREVIEW_REQUEST_URL} key="1" rel="noreferrer" target="_blank" />,
              ]}
            />
          </div>
          {url && (
            <Button
              loading={loading}
              onClick={async () => {
                setLoading(true);
                await downloadFile(url, fileName || 'download');
                setLoading(false);
              }}
            >
              {t('preview.downloadFile')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotSupport;
