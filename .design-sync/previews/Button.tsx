import { Button } from '@orvilo/ui';

export const Variants = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    <Button>Create task</Button>
    <Button variant="secondary">Save draft</Button>
    <Button variant="outline">Invite member</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete project</Button>
    <Button variant="link">View changelog</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button>Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Button disabled>Disabled</Button>
    <Button loading>Saving…</Button>
  </div>
);
