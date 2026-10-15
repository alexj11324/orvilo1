'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import EmojiPicker from '@/components/EmojiPicker';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { truncateByWeightedLength } from '@/utils/textLength';

import type { NativePageChrome } from '../NativePageEditorAssembler';

type CreationState = Parameters<NativePageChrome['create']>[0];
/** Actual creation callback is owned by the assembler, including permission,
 * parent/library scope, duplicate-submit guard and emoji-write retry. */
export function NativePageCreate({ state }: { state: CreationState }) {
  const { t } = useTranslation(['file', 'common']);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [localError, setLocalError] = useState<unknown>();
  const canWrite = state.canCreate && !state.pending;
  const create = async () => {
    if (!canWrite) return;
    setLocalError(undefined);
    try {
      await state.create();
    } catch (error) {
      setLocalError(error);
    }
  };
  return (
    <form
      className="flex min-w-0 flex-col gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <EmojiPicker
        allowDelete
        open={emojiOpen && canWrite}
        title={t('pageEditor.chooseIcon', { ns: 'file' })}
        value={state.emoji}
        customRender={(value) => (
          <Button disabled={!canWrite} type="button" variant="ghost">
            {value ? <Avatar avatar={value} shape="square" size={28} /> : null}
            {t('pageEditor.chooseIcon', { ns: 'file' })}
          </Button>
        )}
        onChange={(emoji) => {
          if (canWrite) state.setEmoji(emoji);
          setEmojiOpen(false);
        }}
        onDelete={() => {
          if (canWrite) state.setEmoji(undefined);
          setEmojiOpen(false);
        }}
        onOpenChange={(next) => {
          if (canWrite) setEmojiOpen(next);
        }}
      />
      <Textarea
        aria-label={t('pageEditor.titlePlaceholder', { ns: 'file' })}
        className="min-h-0 resize-none text-3xl leading-tight font-semibold"
        placeholder={t('pageEditor.titlePlaceholder', { ns: 'file' })}
        readOnly={!canWrite}
        rows={1}
        value={state.title}
        onChange={(event) => {
          if (canWrite) state.setTitle(truncateByWeightedLength(event.target.value, 100));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && canWrite) {
            event.preventDefault();
            void create();
          }
        }}
      />
      <div>
        <Button disabled={!canWrite} type="submit">
          {state.pending ? <Spinner /> : null}
          {t('pageEditor.empty.createNewDocument', { ns: 'file' })}
        </Button>
      </div>
      {localError || state.error ? (
        <AsyncError
          error={localError ?? state.error}
          retrying={state.pending}
          variant="inline"
          onRetry={
            canWrite
              ? () => {
                  void create();
                }
              : undefined
          }
        />
      ) : null}
    </form>
  );
}
