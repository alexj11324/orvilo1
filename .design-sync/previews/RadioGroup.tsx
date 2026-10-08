import { Label, RadioGroup, RadioGroupItem } from '@orvilo/ui';

const item = { display: 'flex', alignItems: 'center', gap: 8 } as const;

export const Default = () => (
  <RadioGroup defaultValue="team">
    <div style={item}>
      <RadioGroupItem id="v-private" value="private" />
      <Label htmlFor="v-private">Private — only you</Label>
    </div>
    <div style={item}>
      <RadioGroupItem id="v-team" value="team" />
      <Label htmlFor="v-team">Team — everyone in the workspace</Label>
    </div>
    <div style={item}>
      <RadioGroupItem disabled id="v-public" value="public" />
      <Label htmlFor="v-public">Public — available on Business plans</Label>
    </div>
  </RadioGroup>
);
