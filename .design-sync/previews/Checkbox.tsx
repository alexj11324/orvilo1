import { Checkbox, Label } from '@orvilo/ui';

const item = { display: 'flex', alignItems: 'center', gap: 8 } as const;

export const States = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <div style={item}>
      <Checkbox defaultChecked id="notify" />
      <Label htmlFor="notify">Email me when I'm assigned</Label>
    </div>
    <div style={item}>
      <Checkbox id="digest" />
      <Label htmlFor="digest">Send a weekly digest</Label>
    </div>
    <div style={item}>
      <Checkbox disabled id="locked" />
      <Label htmlFor="locked">Managed by your admin</Label>
    </div>
    <div style={item}>
      <Checkbox defaultChecked disabled id="locked-on" />
      <Label htmlFor="locked-on">Required for all members</Label>
    </div>
  </div>
);
