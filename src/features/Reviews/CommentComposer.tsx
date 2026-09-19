import { Flexbox } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { memo, useState } from 'react';

import TextArea from '@/components/TextArea';

const CommentComposer = memo<{
  disabled?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  placeholder: string;
  submitLabel: string;
}>(({ disabled, onSubmit, placeholder, submitLabel }) => {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <Flexbox gap={8}>
      <TextArea
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        value={body}
        onChange={setBody}
      />
      <Flexbox horizontal justify={'flex-end'}>
        <Button
          disabled={disabled || !body.trim()}
          loading={submitting}
          size={'small'}
          onClick={async () => {
            setSubmitting(true);
            // `false` means the write did not land — keep the draft.
            const ok = await onSubmit(body.trim());
            setSubmitting(false);
            if (ok) setBody('');
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
