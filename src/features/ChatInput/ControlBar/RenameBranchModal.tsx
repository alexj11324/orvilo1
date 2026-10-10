'use client';

import { t } from 'i18next';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface RenameBranchContentProps {
  /** The branch's current name — prefilled and selected for quick editing. */
  currentName: string;
  /**
   * Rename the branch. Return an error message to show inline and keep the
   * modal open; return undefined on success (the modal closes).
   */
  onSubmit: (name: string) => Promise<string | undefined>;
}

const RenameBranchContent = memo<RenameBranchContentProps>(({ currentName, onSubmit }) => {
  const { t: tDevice } = useTranslation('device');
  const { t: tCommon } = useTranslation('common');
  const { close } = useModalContext();
  const [value, setValue] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus + select the whole name so the user can immediately retype.
    queueMicrotask(() => inputRef.current?.select());
  }, []);

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    const name = value.trim();
    if (!name || name === currentName) return;
    setLoading(true);
    try {
      const message = await onSubmit(name);
      if (message) {
        setError(message);
        return;
      }
      close();
    } finally {
      setLoading(false);
    }
  }, [close, currentName, loading, onSubmit, value]);

  const trimmed = value.trim();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Input
          placeholder={tDevice('workingDirectory.newBranchPlaceholder')}
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
        />
        {error ? <div className="text-[12px] text-destructive">{error}</div> : null}
      </div>
      <div className="flex flex-row gap-2 justify-end">
        <Button disabled={loading} onClick={close}>
          {tCommon('cancel')}
        </Button>
        <Button
          disabled={!trimmed || trimmed === currentName}
          loading={loading}
          variant="default"
          onClick={handleSubmit}
        >
          {tDevice('workingDirectory.renameBranchAction')}
        </Button>
      </div>
    </div>
  );
});

RenameBranchContent.displayName = 'RenameBranchContent';

/**
 * Branch-name entry for renaming a local branch. Prefills the current name and
 * submits the new one; the dropdown closes before this opens (mirrors the
 * create-branch flow).
 */
export const openRenameBranchModal = (options: {
  currentName: string;
  onSubmit: (name: string) => Promise<string | undefined>;
}): ModalInstance =>
  createModal({
    content: <RenameBranchContent currentName={options.currentName} onSubmit={options.onSubmit} />,
    footer: null,
    maskClosable: true,
    styles: { header: { borderBottom: 'none' } },
    title: t('workingDirectory.renameBranchTitle', { ns: 'device' }),
    width: 'min(90vw, 480px)',
  });
