import { Label, Textarea } from '@orvilo/ui';

export const Default = () => (
  <div style={{ display: 'grid', gap: 6, width: 320 }}>
    <Label htmlFor="desc">Description</Label>
    <Textarea id="desc" placeholder="Describe what needs to happen and why." />
  </div>
);

export const WithValue = () => (
  <div style={{ width: 320 }}>
    <Textarea
      defaultValue={
        'Steps to reproduce\n1. Open the project board\n2. Drag an issue to Done\n3. Reload the page'
      }
    />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 320 }}>
    <Textarea disabled defaultValue="Archived projects can't be edited." />
  </div>
);
