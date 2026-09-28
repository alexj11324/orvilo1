import { Flexbox } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { memo, useState } from 'react';

import TextArea from '@/components/TextArea';

import type { WriteOutcome } from './types';

const CommentComposer = memo<{
  disabled?: boolean;
  onSubmit: (body: string) => Promise<WriteOutcome>;
  placeholder: string;
  submitLabel: string;
  /** Explains the recoverable state after an unconfirmed write. */
  unknownHint?: string;
}>(({ disabled, onSubmit, placeholder, submitLabel, unknownHint }) => {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // The last write's delivery could not be confirmed — the draft stays and a
  // retry replays the same intent-derived operationId instead of double-posting.
  const [unconfirmed, setUnconfirmed] = useState(false);
  return (
    <Flexbox gap={8}>
      <TextArea
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        value={body}
        onChange={setBody}
      />
      {unconfirmed && unknownHint ? (
        <Text fontSize={12} type={'warning'}>
          {unknownHint}
        </Text>
      ) : null}
      <Flexbox horizontal justify={'flex-end'}>
        <Button
          disabled={disabled || !body.trim()}
          loading={submitting}
          size={'small'}
          onClick={async () => {
            setSubmitting(true);
            const outcome = await onSubmit(body.trim());
            setSubmitting(false);
            setUnconfirmed(outcome === 'unknown');
            if (outcome === 'applied') setBody('');
          }}
        >
          {submitLabel}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

CommentComposer.displayName = 'CommentComposer';

export default CommentComposer;
