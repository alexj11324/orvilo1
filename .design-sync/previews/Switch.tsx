import { Label, Switch } from '@orvilo/ui';

const item = { display: 'flex', alignItems: 'center', gap: 8 } as const;

export const States = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <div style={item}>
      <Switch defaultChecked id="auto-assign" />
      <Label htmlFor="auto-assign">Auto-assign new issues</Label>
    </div>
    <div style={item}>
      <Switch id="private" />
      <Label htmlFor="private">Make project private</Label>
    </div>
    <div style={item}>
      <Switch disabled id="sso" />
      <Label htmlFor="sso">Require SSO (Enterprise)</Label>
    </div>
  </div>
);

export const Small = () => (
  <div style={item}>
    <Switch defaultChecked id="compact" size="sm" />
    <Label htmlFor="compact">Compact view</Label>
  </div>
);
