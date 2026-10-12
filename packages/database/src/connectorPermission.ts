export const ConnectorToolPermission = {
  auto: 'auto',
  disabled: 'disabled',
  needs_approval: 'needs_approval',
} as const;

export type ConnectorToolPermission =
  (typeof ConnectorToolPermission)[keyof typeof ConnectorToolPermission];
