import { Input, Label } from '@orvilo/ui';

export const Default = () => (
  <div style={{ display: 'grid', gap: 6, width: 280 }}>
    <Label htmlFor="project-name">Project name</Label>
    <Input id="project-name" placeholder="e.g. Mobile onboarding" />
  </div>
);

export const WithValue = () => (
  <div style={{ display: 'grid', gap: 6, width: 280 }}>
    <Label htmlFor="owner-email">Owner email</Label>
    <Input defaultValue="alex@orvilo.app" id="owner-email" type="email" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 280 }}>
    <Input disabled defaultValue="Read-only workspace slug" />
  </div>
);

export const Invalid = () => (
  <div style={{ display: 'grid', gap: 6, width: 280 }}>
    <Input aria-invalid defaultValue="not-an-email" />
    <span style={{ fontSize: 12, color: 'var(--destructive-text)' }}>
      Enter a valid email address.
    </span>
  </div>
);
