'use client';

import { cn } from 'cn';
import { ChevronUp } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

const styles = {
  bar: 'pointer-events-auto absolute inset-be-full [inset-inline:0] translate-y-1 flex items-center justify-center min-h-10 pbe-1 opacity-0 bg-transparent transition-[opacity,transform] duration-(--orvilo-motion-mid) ease-out',
  visible: 'translate-y-0 opacity-100',
  trigger:
    'px-2.5 rounded-full text-sm leading-5.5 text-muted-foreground bg-popover border-divider shadow-(--shadow-raised) transition-[color,border-color,background-color] duration-(--orvilo-motion-mid) ease-[ease] hover:border-border hover:text-foreground hover:bg-card',
  hidden: 'pointer-events-none',
};

export interface HoverExpandBarProps {
  bottomOffset?: number;
  onExpand: () => void;
  visible: boolean;
}

const HoverExpandBar = memo<HoverExpandBarProps>(({ bottomOffset = 0, visible, onExpand }) => {
  const { t } = useTranslation('chat');
  const s = styles;

  return (
    <div
      aria-hidden={!visible}
      className={cn(s.bar, visible ? s.visible : s.hidden)}
      data-testid="floating-chat-panel-hover-bar"
      style={bottomOffset > 0 ? { insetBlockEnd: `calc(100% + ${bottomOffset}px)` } : undefined}
    >
      <Button
        className={s.trigger}
        data-testid="floating-chat-panel-expand-button"
        size="normal"
        tabIndex={visible ? 0 : -1}
        type="button"
        variant="outline"
        onClick={onExpand}
      >
        <ChevronUp className="size-4" size={16} />
        {t('floatingChatPanel.expand', { defaultValue: 'Expand' })}
      </Button>
    </div>
  );
});

HoverExpandBar.displayName = 'FloatingChatPanelHoverExpandBar';

export default HoverExpandBar;
