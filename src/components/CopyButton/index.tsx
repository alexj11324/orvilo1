'use client';

import { Check, Copy, type LucideIcon } from 'lucide-react';
import { memo, type MouseEvent, useEffect, useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { copyToClipboard } from '@/utils/clipboard';

const COPIED_RESET_MS = 2_000;

interface CopyButtonProps {
  active?: boolean;
  content: string | (() => string);
  icon?: LucideIcon;
  onClick?: (e: MouseEvent) => void;
  size?: 'small' | 'middle' | 'large' | number;
  title?: string;
}

const CopyButton = memo<CopyButtonProps>(({ active, content, icon, onClick, ...rest }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const ResolvedIcon = icon || Copy;
  return (
    <ActionIcon
      {...rest}
      active={active || copied}
      icon={copied ? Check : ResolvedIcon}
      onClick={async (e) => {
        const resolved = typeof content === 'function' ? content() : content;
        await copyToClipboard(resolved);
        setCopied(true);
        onClick?.(e);
      }}
    />
  );
});

CopyButton.displayName = 'CopyButton';

export default CopyButton;
