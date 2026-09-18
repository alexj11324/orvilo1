import { ProductLogo } from '@/components/Branding';
import { cn } from '@/lib/utils';

export function OnboardingLogo({ className }: { className?: string }) {
  return (
    <div className={cn('inline-flex items-center', className)}>
      <ProductLogo size={28} type={'combine'} />
    </div>
  );
}
