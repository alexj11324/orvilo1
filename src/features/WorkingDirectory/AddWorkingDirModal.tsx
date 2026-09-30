'use client';

import { cssVar } from 'antd-style';
import { t } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { createModal, ModalInstance, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { RemoteDirectoryBrowser } from './RemoteDirectoryBrowser';

interface AddWorkingDirContentProps {
  defaultPath?: string;
  deviceId?: string;
  /**
   * Submit the entered path. Return an error message to show inline and keep the
   * modal open; return undefined on success (the modal closes). Lets the caller
   * validate (e.g. statPath) and enrich (repoType) in one round-trip.
   */
  onSubmit: (path: string) => Promise<string | undefined>;
  placeholder?: string;
}

const AddWorkingDirContent = ({
  defaultPath,
  deviceId,
  onSubmit,
  placeholder,
}: AddWorkingDirContentProps) => {
  const { t: tPlugin } = useTranslation('device');
  const { t: tCommon } = useTranslation('common');
  const { close } = useModalContext();
  const [manual, setManual] = useState(!deviceId);
  const [value, setValue] = useState(defaultPath ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => inputRef.current?.focus());
  }, [manual]);

  const handleSubmit = async (path: string) => {
    if (loading) return;
    const next = path.trim();
    if (!next) return;
    setError(undefined);
    setLoading(true);
    try {
      const message = await onSubmit(next);
      if (message) {
        setError(message);
        return;
      }
      close();
    } catch (cause) {
      console.error('Failed to add working directory', cause);
      setError(tPlugin('workingDirectory.addFolderFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!manual && deviceId) {
    return (
      <RemoteDirectoryBrowser
        defaultPath={value.trim() || undefined}
        deviceId={deviceId}
        error={error}
        loading={loading}
        onCancel={close}
        onSelect={handleSubmit}
        onManual={(path) => {
          setValue(path);
          setError(undefined);
          setManual(true);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground">{tPlugin('workingDirectory.addFolderDesc')}</div>
      <div className="flex flex-col gap-2">
        <Input
          aria-label={tPlugin('workingDirectory.current')}
          disabled={loading}
          placeholder={placeholder || tPlugin('workingDirectory.placeholder')}
          ref={inputRef}
          value={value}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit(value)}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
        />
        {error ? <div style={{ color: cssVar.colorError, fontSize: 12 }}>{error}</div> : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {deviceId && (
          <Button
            disabled={loading}
            onClick={() => {
              setError(undefined);
              setManual(false);
            }}
          >
            {tPlugin('workingDirectory.browseFolders')}
          </Button>
        )}
        <Button disabled={loading} onClick={close}>
          {tCommon('cancel')}
        </Button>
        <Button disabled={!value.trim()} loading={loading} onClick={() => handleSubmit(value)}>
          {tPlugin('workingDirectory.useFolder')}
        </Button>
      </div>
    </div>
  );
};

/** Browse a connected device, with manual entry available as a fallback. */
export const openAddWorkingDirModal = (options: AddWorkingDirContentProps): ModalInstance =>
  createModal({
    content: <AddWorkingDirContent {...options} />,
    footer: null,
    maskClosable: true,
    styles: { header: { borderBottom: 'none' } },
    title: t('workingDirectory.addFolderTitle', { ns: 'device' }),
    width: 'min(90vw, 560px)',
  });
