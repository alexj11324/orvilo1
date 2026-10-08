import { Separator } from '@orvilo/ui';

export const Horizontal = () => (
  <div style={{ width: 280, fontSize: 14 }}>
    <div style={{ fontWeight: 500 }}>Orvilo</div>
    <div style={{ opacity: 0.7 }}>Plan work, run agents, ship.</div>
    <Separator style={{ margin: '12px 0' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 20 }}>
      <span>Issues</span>
      <Separator orientation="vertical" />
      <span>Projects</span>
      <Separator orientation="vertical" />
      <span>Views</span>
    </div>
  </div>
);
