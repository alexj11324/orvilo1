'use client';

import { type ReactNode } from 'react';

import { SETTINGS_ANCHOR_ROW_ATTR, SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';

interface ProfileRowProps {
  action?: ReactNode;
  /** Settings-search anchor id; when set, the row becomes a scroll/highlight target */
  anchor?: string;
  children?: ReactNode;
  description?: string;
  label?: string;
  labelSlot?: ReactNode;
}

const ProfileRow = ({
  anchor,
  description,
  label,
  labelSlot,
  children,
  action,
}: ProfileRowProps) => {
  const labelNode = labelSlot ?? (label && <span className="text-sm">{label}</span>);

  return (
    <div
      className={
        'flex min-h-16 items-center gap-6 py-4 max-md:flex-col max-md:items-stretch max-md:gap-3'
      }
      {...(anchor ? { [SETTINGS_ANCHOR_ROW_ATTR]: '' } : undefined)}
    >
      <div className="flex-1 max-md:flex-none">
        {anchor ? <SettingsSearchAnchor id={anchor}>{labelNode}</SettingsSearchAnchor> : labelNode}
        {description && (
          <div>
            <span className="text-[13px] text-muted-foreground">{description}</span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-[0_1_auto] items-center justify-between gap-3">
        {children}
        {action && <div className="ms-auto shrink-0">{action}</div>}
      </div>
    </div>
  );
};

export default ProfileRow;
