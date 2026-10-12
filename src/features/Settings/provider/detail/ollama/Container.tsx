import { XIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';

const styles = {
  close: 'absolute inset-bs-4 end-4',
  container:
    'relative flex w-full flex-col border border-divider rounded-(--radius-card) bg-card px-4',
};

const Container = ({
  setError,
  children,
}: {
  children: ReactNode;
  setError: (error?: any) => void;
}) => {
  const { t: tCommon } = useTranslation('common');
  const [show, setShow] = useState(true);

  return (
    show && (
      <div className={styles.container}>
        <ActionIcon
          aria-label={tCommon('close')}
          className={styles.close}
          icon={XIcon}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
          onClick={() => {
            setShow(false);
            setError(undefined);
          }}
        />
        {children}
      </div>
    )
  );
};

export default Container;
