'use client';

import { cn } from 'cn';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';

import { resolveAcceptanceVerdictMeta } from '../verdict';

const styles = {
  pill: 'inline-flex items-center gap-[5px] py-0.5 px-2.5 rounded-[99px] text-[12px] font-medium',
  interactive:
    'cursor-pointer transition-[filter] duration-(--ant-motion-duration-mid) ease-[ease] hover:brightness-[1.08]',
};

interface AcceptanceStatusPillProps {
  menu?: DropdownItem[];
  pending?: boolean;
  size?: number;
  status: string;
}

const AcceptanceStatusPill = ({ menu, pending, size = 13, status }: AcceptanceStatusPillProps) => {
  const { t } = useTranslation('verify');
  const verdictMeta = resolveAcceptanceVerdictMeta(status, t);
  const pill = (
    <span
      className={menu ? cn(styles.pill, styles.interactive) : styles.pill}
      title={menu ? t('acceptance.workspace.actions.status') : undefined}
      style={{
        background: verdictMeta.bg,
        color: verdictMeta.color,
        pointerEvents: pending ? 'none' : undefined,
      }}
    >
      <verdictMeta.icon className="animate-spin" size={size} />
      {verdictMeta.label}
      {menu ? <ChevronDown size={11} /> : null}
    </span>
  );

  return menu ? <DropdownMenu items={menu}>{pill}</DropdownMenu> : pill;
};

export default AcceptanceStatusPill;
