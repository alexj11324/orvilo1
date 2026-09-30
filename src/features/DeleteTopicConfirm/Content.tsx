'use client';

import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';

interface DeleteTopicConfirmContentProps {
  defaultRemoveFiles?: boolean;
  description?: ReactNode;
  onChange: (removeFiles: boolean) => void;
  showRemoveFiles: boolean;
}

export const DeleteTopicConfirmContent = memo<DeleteTopicConfirmContentProps>(
  ({ description, onChange, showRemoveFiles, defaultRemoveFiles = true }) => {
    const { t } = useTranslation('topic');
    const [checked, setChecked] = useState(defaultRemoveFiles);

    return (
      <div className="flex flex-col gap-3">
        {description ?? t('actions.confirmRemoveTopic')}
        {showRemoveFiles && (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => {
                setChecked(value);
                onChange(value);
              }}
            />
            {t('actions.confirmRemoveTopicFiles')}
          </label>
        )}
      </div>
    );
  },
);
