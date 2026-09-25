/**
 * Linear's compact inbox age: `14h`, `3d`, `2w` — one number and a unit, no
 * "ago", so the column stays a fixed narrow width. zh reads 「14小时」「3天」.
 */
const UNITS = [
  { en: 'y', ms: 365 * 86_400_000, zh: '年' },
  { en: 'mo', ms: 30 * 86_400_000, zh: '个月' },
  { en: 'w', ms: 7 * 86_400_000, zh: '周' },
  { en: 'd', ms: 86_400_000, zh: '天' },
  { en: 'h', ms: 3_600_000, zh: '小时' },
  { en: 'm', ms: 60_000, zh: '分钟' },
] as const;

export const formatInboxAge = (
  at: Date | number | string,
  options: { locale?: string; now?: Date } = {},
): string => {
  const time = new Date(at).getTime();
  if (!Number.isFinite(time)) return '';
  const elapsed = Math.max(0, (options.now ?? new Date()).getTime() - time);
  const zh = options.locale?.toLowerCase().startsWith('zh') ?? false;
  for (const unit of UNITS) {
    // Weeks stop at four: a fifth week reads as a month in Linear's feed.
    if (unit.en === 'w' && elapsed >= 30 * 86_400_000) continue;
    const count = Math.floor(elapsed / unit.ms);
    if (count >= 1) return zh ? `${count}${unit.zh}` : `${count}${unit.en}`;
  }
  return zh ? '刚刚' : 'now';
};
