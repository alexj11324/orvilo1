import { Alert, AlertDescription, AlertTitle } from '@orvilo/ui';

const stack = { display: 'grid', gap: 12, width: 420 } as const;

export const Variants = () => (
  <div style={stack}>
    <Alert>
      <AlertTitle>Workspace updated</AlertTitle>
      <AlertDescription>
        Your changes are saved and visible to everyone on the team.
      </AlertDescription>
    </Alert>
    <Alert variant="info">
      <AlertTitle>New cycle starts Monday</AlertTitle>
      <AlertDescription>
        Unfinished issues will move to the next cycle automatically.
      </AlertDescription>
    </Alert>
    <Alert variant="success">
      <AlertTitle>Deployment finished</AlertTitle>
      <AlertDescription>Version 2.4.1 is live in production.</AlertDescription>
    </Alert>
    <Alert variant="warning">
      <AlertTitle>Usage limit approaching</AlertTitle>
      <AlertDescription>You have used 90% of this month's agent runs.</AlertDescription>
    </Alert>
    <Alert variant="destructive">
      <AlertTitle>Could not connect</AlertTitle>
      <AlertDescription>The device is offline. Check your network and try again.</AlertDescription>
    </Alert>
  </div>
);
