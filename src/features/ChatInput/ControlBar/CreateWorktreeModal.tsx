'use client';

import { t } from 'i18next';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CreateWorktreeContentProps {
  /**
   * Create the worktree on a fresh branch. Return an error message to show
   * inline and keep the modal open; return undefined on success (modal closes).
   */
  onSubmit: (branch: string) => Promise<string | undefined>;
  /** Preview the target directory the new worktree will occupy for a branch name. */
  resolvePath: (branch: string) => string;
}

const CreateWorktreeContent = memo<CreateWorktreeContentProps>(({ onSubmit, resolvePath }) => {
  const { t: tDevice } = useTranslation('device');
  const { t: tCommon } = useTranslation('common');
  const { close } = useModalContext();
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  const trimmed = value.trim();
  // Show where the worktree will land so the destination is never a surprise.
  const previewPath = useMemo(() => (trimmed ? resolvePath(trimmed) : ''), [resolvePath, trimmed]);

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    const branch = value.trim();
    if (!branch) return;
    setLoading(true);
    try {
      const message = await onSubmit(branch);
      if (message) {
        setError(message);
        return;
      }
      close();
    } finally {
      setLoading(false);
    }
  }, [close, loading, onSubmit, value]);

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
        {previewPath ? (
          <div className="text-[12px] text-(--ant-color-text-tertiary) break-all">
            {tDevice('workingDirectory.newWorktreeLocation', { path: previewPath })}
          </div>
        ) : null}
        {error ? <div className="text-[12px] text-destructive">{error}</div> : null}
      </div>
      <div className="flex flex-row gap-2 justify-end">
        <Button disabled={loading} onClick={close}>
          {tCommon('cancel')}
        </Button>
        <Button disabled={!trimmed} loading={loading} variant="default" onClick={handleSubmit}>
          {tDevice('workingDirectory.createWorktreeSubmit')}
        </Button>
      </div>
    </div>
  );
});

CreateWorktreeContent.displayName = 'CreateWorktreeContent';

/**
 * Branch-name entry for "create worktree". Mirrors the create-branch modal but
 * adds a live preview of the sibling directory the new worktree will occupy.
 * Submitting runs `git worktree add -b <branch> <path>` and switches into it.
 */
export const openCreateWorktreeModal = (options: {
  onSubmit: (branch: string) => Promise<string | undefined>;
  resolvePath: (branch: string) => string;
}): ModalInstance =>
  createModal({
    content: (
      <CreateWorktreeContent resolvePath={options.resolvePath} onSubmit={options.onSubmit} />
    ),
    footer: null,
    maskClosable: true,
    styles: { header: { borderBottom: 'none' } },
    title: t('workingDirectory.createWorktreeTitle', { ns: 'device' }),
    width: 'min(90vw, 480px)',
  });
