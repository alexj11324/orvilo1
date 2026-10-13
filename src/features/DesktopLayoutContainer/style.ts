import { isDesktop } from '@/const/version';

export const styles = {
  // Public container variables retain precedence over the panel role defaults.
  innerContainer:
    'relative overflow-hidden border [border-color:var(--container-border-color,var(--border))] rounded-(--container-border-radius,var(--radius-card)) rounded-ee-[var(--container-border-bottom-right-radius,var(--container-border-radius,var(--radius-card)))] bg-card',
  outerContainer: `relative overflow-hidden [padding-block-start:var(--container-padding-top,calc(var(--spacing)*2))] [padding-inline-start:var(--container-padding-left,calc(var(--spacing)*2))] ${
    isDesktop ? 'bg-transparent' : 'bg-background'
  }`,
};
