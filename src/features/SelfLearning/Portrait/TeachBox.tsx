'use client';

import { Button } from '@lobehub/ui/base-ui';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Textarea } from '@/components/ui/textarea';

interface TeachBoxProps {
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<void> | void;
  placeholder: string;
}

/** 一句话教它。教学动作全是随手的，所以这里只有一个输入框和一个按钮。 */
const TeachBox = memo<TeachBoxProps>(({ autoFocus, onSubmit, placeholder }) => {
  const { t } = useTranslation('selfLearning');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-end gap-2 w-full">
      <Textarea
        autoFocus={autoFocus}
        disabled={busy}
        placeholder={placeholder}
        rows={1}
        style={{ flex: 1, maxHeight: 96, minHeight: 0 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
      />
      <Button disabled={!value.trim()} loading={busy} type={'primary'} onClick={submit}>
        {t('habit.teach.send')}
      </Button>
    </div>
  );
});

TeachBox.displayName = 'ExpertiseTeachBox';

export default TeachBox;
