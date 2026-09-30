import { memo, useState } from 'react';

import { Button } from '@/components/ui/button';

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
    <div className="flex flex-col gap-2">
      <Textarea
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        value={body}
        onChange={setBody}
      />
      {unconfirmed && unknownHint ? (
        <div className="text-[12px] text-warning">{unknownHint}</div>
      ) : null}
      <div className="flex justify-end">
        <Button
          disabled={disabled || !body.trim()}
          loading={submitting}
          size="sm"
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
      </div>
    </div>
  );
});

CommentComposer.displayName = 'CommentComposer';

export default CommentComposer;
