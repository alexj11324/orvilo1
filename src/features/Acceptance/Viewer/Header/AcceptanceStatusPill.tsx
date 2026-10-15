'use client';

import { cn } from 'cn';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';

import { resolveAcceptanceVerdictMeta } from '../verdict';

const styles = {
  pill: 'inline-flex items-center gap-1.25 py-0.5 px-2.5 rounded-full text-xs font-medium',
  interactive:
    'min-h-7 [@media(pointer:coarse)]:min-h-11 cursor-pointer transition-[filter] duration-(--orvilo-motion-mid) ease-[ease] hover:brightness-[1.08]',
};

const verdictTextColors: Record<string, string> = {
  'var(--destructive)': 'var(--destructive-text)',
  'var(--info)': 'var(--info-text)',
  'var(--success)': 'var(--success-text)',
  'var(--warning)': 'var(--warning-text)',
};

interface AcceptanceStatusPillProps {
  menu?: DropdownItem[];
  pending?: boolean;
  size?: number;
  status: string;
}

const AcceptanceStatusPill = ({ menu, pending, size = 16, status }: AcceptanceStatusPillProps) => {
  const { t } = useTranslation('verify');
  const verdictMeta = resolveAcceptanceVerdictMeta(status, t);
  const pill = (
    <span
      className={menu ? cn(styles.pill, styles.interactive) : styles.pill}
      title={menu ? t('acceptance.workspace.actions.status') : undefined}
      style={{
        background: verdictMeta.bg,
        color: verdictTextColors[verdictMeta.color] ?? verdictMeta.color,
        pointerEvents: pending ? 'none' : undefined,
      }}
    >
      <verdictMeta.icon className="animate-spin" size={size} />
      {verdictMeta.label}
      {menu ? <ChevronDown size={16} /> : null}
    </span>
  );

  return menu ? <DropdownMenu items={menu}>{pill}</DropdownMenu> : pill;
};

export default AcceptanceStatusPill;
