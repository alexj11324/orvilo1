'use client';

import { SmilePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import EmojiPicker from '@/components/EmojiPicker';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import type { NativePageChromeState } from '../NativePageEditorAssembler';

/** UI title uses DESIGN.md's approved 30px heading scale, not the legacy
 * inline 36px value. The local primitive preserves rem-based root scaling. */
export function NativePageTitle({ state }: { state: NativePageChromeState }) {
  const { t } = useTranslation(['file', 'editor', 'common']);
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<unknown>();
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!state.metaEditable) setOpen(false);
  }, [state.metaEditable]);
  const flush = async () => {
    setLocalError(undefined);
    setRetrying(true);
    try {
      await state.submitTitle();
    } catch (error) {
      setLocalError(error);
    } finally {
      setRetrying(false);
    }
  };
  return (
    <section className="flex flex-col gap-4 py-4" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-2">
        {state.emoji && !state.metaEditable ? (
          <Avatar avatar={state.emoji} shape="square" size={40} />
        ) : state.emoji || open ? (
          <EmojiPicker
            allowDelete
            open={open}
            title={t('pageEditor.chooseIcon', { ns: 'file' })}
            value={state.emoji}
            onChange={(emoji) => {
              if (!state.metaEditable) return;
              state.metadata.setEmoji(emoji);
              setOpen(false);
            }}
            onDelete={() => {
              if (!state.metaEditable) return;
              state.metadata.setEmoji(undefined);
              setOpen(false);
            }}
            onOpenChange={(next) => {
              if (state.metaEditable) setOpen(next);
            }}
          />
        ) : (
          <Button disabled={!state.metaEditable} variant="ghost" onClick={() => setOpen(true)}>
            <SmilePlus />
            {t('pageEditor.chooseIcon', { ns: 'file' })}
          </Button>
        )}
        {state.metadata.status === 'saving' ? (
          <span
            aria-live="polite"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <Spinner />
            {t('autoSave.savingShort', { ns: 'editor' })}
          </span>
        ) : null}
        {state.metadata.status === 'saved' && !state.metadata.dirty ? (
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {t('autoSave.saved', { ns: 'editor' })}
          </span>
        ) : null}
      </div>
      <Textarea
        aria-label={t('pageEditor.titlePlaceholder', { ns: 'file' })}
        className="min-h-0 resize-none rounded-none border-0 px-0 py-0 text-3xl leading-tight font-semibold shadow-none focus-visible:ring-0"
        placeholder={t('pageEditor.titlePlaceholder', { ns: 'file' })}
        readOnly={!state.metaEditable}
        rows={1}
        value={state.title}
        onChange={(event) => {
          if (state.metaEditable) state.metadata.setTitle(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && state.metaEditable) {
            event.preventDefault();
            void flush();
          }
        }}
      />
      {localError || state.metadata.error ? (
        <AsyncError
          description={t('pageEditor.saveFailed', { ns: 'file' })}
          error={localError ?? state.metadata.error}
          retrying={retrying}
          variant="inline"
          onRetry={
            state.metaEditable
              ? () => {
                  void flush();
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
