import { Badge } from '@orvilo/ui';

const row = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as const;

export const Solid = () => (
  <div style={row}>
    <Badge>Default</Badge>
    <Badge variant="secondary">Backlog</Badge>
    <Badge variant="outline">Draft</Badge>
    <Badge variant="info">In review</Badge>
    <Badge variant="success">Done</Badge>
    <Badge variant="warning">Blocked</Badge>
    <Badge variant="destructive">Failed</Badge>
  </div>
);

export const Light = () => (
  <div style={row}>
    <Badge variant="info-light">In review</Badge>
    <Badge variant="success-light">Done</Badge>
    <Badge variant="warning-light">Blocked</Badge>
    <Badge variant="destructive-light">Failed</Badge>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Badge size="xs">XS</Badge>
    <Badge size="sm">SM</Badge>
    <Badge>Default</Badge>
    <Badge size="lg">LG</Badge>
    <Badge radius="full">Pill</Badge>
  </div>
);
