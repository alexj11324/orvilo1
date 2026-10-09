'use client';

import { copyToClipboard } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

const COPIED_RESET_MS = 2000;

/** Model ID as a small monospace chip; clicking copies it and shows a "copied" state. */
const ModelIdChip = memo<{ id: string }>(({ id }) => {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      className="h-5 max-w-full min-w-0 flex-none gap-1 px-1.5 font-mono text-xs font-normal text-muted-foreground"
      size="xs"
      title={copied ? t('copySuccess') : t('copy')}
      variant="outline"
      onClick={async (e) => {
        e.stopPropagation();
        await copyToClipboard(id);
        setCopied(true);
        toast.success(t('copySuccess'));
      }}
    >
      <span className="truncate">{id}</span>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
});

ModelIdChip.displayName = 'ModelIdChip';

export default ModelIdChip;
