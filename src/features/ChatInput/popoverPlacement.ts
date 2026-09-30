interface PlacementConfig {
  align: 'center' | 'end' | 'start';
  side: 'bottom' | 'inline-end' | 'inline-start' | 'left' | 'right' | 'top';
}

const PLACEMENT_MAP: Record<string, PlacementConfig> = {
  bottom: { align: 'center', side: 'bottom' },
  bottomCenter: { align: 'center', side: 'bottom' },
  bottomLeft: { align: 'start', side: 'bottom' },
  bottomRight: { align: 'end', side: 'bottom' },
  left: { align: 'center', side: 'left' },
  leftBottom: { align: 'end', side: 'left' },
  leftTop: { align: 'start', side: 'left' },
  right: { align: 'center', side: 'right' },
  rightBottom: { align: 'end', side: 'right' },
  rightTop: { align: 'start', side: 'right' },
  top: { align: 'center', side: 'top' },
  topCenter: { align: 'center', side: 'top' },
  topLeft: { align: 'start', side: 'top' },
  topRight: { align: 'end', side: 'top' },
};

export const popoverPlacement = (placement?: string): PlacementConfig =>
  (placement && PLACEMENT_MAP[placement]) || PLACEMENT_MAP.top;
