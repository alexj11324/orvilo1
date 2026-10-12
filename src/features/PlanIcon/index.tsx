import { Plans } from '@orvilo/types';
import { cn } from 'cn';
import { Atom, Box, CircleSlash, Sparkle, Zap } from 'lucide-react';
import { type CSSProperties, type MouseEvent } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import nativeStyles from './PlanIcon.module.css';

export const themes = {
  [Plans.Free]: {
    icon: CircleSlash,
    theme: {
      background: undefined,
      color: undefined,
    },
  },
  [Plans.Hobby]: {
    icon: Box,
    theme: {
      background: 'linear-gradient(45deg, #21B2EE, #2271ED)',
      color: '#E5F8FF',
    },
  },
  [Plans.Starter]: {
    icon: Sparkle,
    theme: {
      background: 'linear-gradient(45deg, #C57948, #803718)',
      color: '#FFC385',
    },
  },
  [Plans.Premium]: {
    icon: Zap,
    theme: {
      background: 'linear-gradient(45deg, #A5B4C2, #606E7B)',
      color: '#FCFDFF',
    },
  },
  [Plans.Ultimate]: {
    icon: Atom,
    theme: {
      background: 'linear-gradient(45deg, #F7A82F, #BB7227)',
      color: '#FCFA6E',
    },
  },
};

const styles = { icon: nativeStyles.icon };

const getPlanIconMetrics = (size: number) => ({
  glyphSize: Math.max(12, Math.round(size / 2)),
  radius: Math.max(8, Math.round(size / 3)),
});

interface PlanIconProps {
  className?: string;
  mono?: boolean;
  onClick?: (e: MouseEvent) => void;
  plan: Plans;
  size?: number;
  style?: CSSProperties;
  type?: 'icon' | 'tag' | 'combine';
}

const PlanIcon = memo<PlanIconProps>(
  ({ type = 'icon', plan, size = 36, mono, style, className, onClick }) => {
    const { icon: IconComponent, theme } = themes[plan];
    const { t } = useTranslation('subscription');
    const isTag = type === 'tag';
    const isCombine = type === 'combine';
    const isFree = plan === Plans.Free;
    const { glyphSize, radius } = getPlanIconMetrics(size);

    if (isTag) {
      return (
        <Badge
          variant="secondary"
          className={cn(
            'm-0 flex-none cursor-pointer rounded-(--radius-chip) border-0 text-xs leading-5',
            className,
          )}
          style={{
            ...(theme || { background: 'var(--selected)', color: 'var(--foreground)' }),
            ...style,
          }}
          onClick={onClick}
        >
          {t(`plans.plan.${plan}.title`)}
        </Badge>
      );
    }

    const iconStyle = {
      ...(mono
        ? null
        : {
            ...theme,
            border: isFree ? undefined : `2px solid ${theme.color}`,
          }),
      borderRadius: radius,
      ...style,
    } satisfies CSSProperties;

    const iconContent = (
      <div
        {...clickableProps()}
        style={{ height: size, width: size, ...iconStyle }}
        className={cn(
          cn(styles.icon, 'flex flex-col items-center justify-center leading-none'),
          CLICKABLE_FOCUS_RING,
        )}
        onClick={onClick}
      >
        <IconComponent color={mono ? undefined : theme.color} size={glyphSize} />
      </div>
    );

    if (isCombine) {
      return (
        <div className="flex items-center gap-2">
          {iconContent}
          <span>{t(`plans.plan.${plan}.title`)}</span>
        </div>
      );
    }

    return iconContent;
  },
);

export default PlanIcon;
