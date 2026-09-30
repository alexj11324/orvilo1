import { X } from 'lucide-react';

import { Badge, type BadgeProps } from '@/components/reui/badge';

interface ClosableBadgeProps extends BadgeProps {
  closeLabel?: string;
  onClose?: () => void;
}

const ClosableBadge = ({ children, closeLabel, onClose, ...rest }: ClosableBadgeProps) => {
  return (
    <Badge {...rest}>
      {children}
      {onClose && (
        <button
          aria-label={closeLabel}
          className="text-muted-foreground hover:text-foreground"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="size-3" />
        </button>
      )}
    </Badge>
  );
};

export default ClosableBadge;
