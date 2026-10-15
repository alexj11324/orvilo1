import { DEFAULT_USER_AVATAR_URL } from '@orvilo/const';
import { cn } from 'cn';
import { AlarmClockIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceMemberProfiles } from '@/business/client/hooks/useWorkspaceMemberProfiles';
import Avatar from '@/components/Avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const AVATAR_SIZE = 16;

const styles = {
  chip: 'flex-none',
  label: 'text-xs leading-5 text-foreground-tertiary whitespace-nowrap',
};

interface AuthorChipProps {
  /** `topic.trigger` — a `cron` run has no human triggerer, only an owning schedule. */
  trigger?: string | null;
  /** `topic.userId` — the member who started (or owns) this run. */
  userId?: string;
}

/**
 * Who triggered a run, on the team view of a workspace inbox. A row the current
 * user didn't start needs a face to be legible — "whose is this?" is the first
 * question when the feed widens past your own work.
 *
 * A `cron`-triggered run has no person behind it, so it reads as a schedule
 * rather than borrowing its owner's face (which would imply they just ran it).
 */
const AuthorChip = memo<AuthorChipProps>(({ userId, trigger }) => {
  const { t } = useTranslation('home');
  const profiles = useWorkspaceMemberProfiles();

  if (trigger === 'cron')
    return (
      <div className={cn(styles.chip, 'flex items-center gap-1')}>
        <AlarmClockIcon className="text-foreground-quaternary" size={12} />
        <span className={styles.label}>{t('inbox.author.scheduled')}</span>
      </div>
    );

  const profile = userId ? profiles.get(userId) : undefined;
  if (!profile) return null;

  const name = profile.fullName || profile.username || '';

  return (
    <div className={cn(styles.chip, 'flex items-center gap-1')}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                <Avatar
                  avatar={profile.avatar || DEFAULT_USER_AVATAR_URL}
                  shape={'circle'}
                  size={AVATAR_SIZE}
                />
              </span>
            }
          />
          <TooltipContent>{name}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className={cn('truncate', 'block', 'max-w-18', styles.label)}>{name}</div>
    </div>
  );
});

export default AuthorChip;
