import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@orvilo/ui';

export const Default = () => (
  <Card style={{ width: 360 }}>
    <CardHeader>
      <CardTitle>Weekly sync</CardTitle>
      <CardDescription>Review open issues and decide what ships this cycle.</CardDescription>
    </CardHeader>
    <CardContent>
      <p style={{ fontSize: 14, margin: 0 }}>
        12 issues in progress, 4 blocked on review. Next planning meeting is Thursday at 10:00.
      </p>
    </CardContent>
    <CardFooter>
      <Button size="sm">Open board</Button>
    </CardFooter>
  </Card>
);

export const WithAction = () => (
  <Card style={{ width: 360 }}>
    <CardHeader>
      <CardTitle>Agent runtime</CardTitle>
      <CardDescription>Claude Code on this device</CardDescription>
      <CardAction>
        <Badge>Connected</Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p style={{ fontSize: 14, margin: 0 }}>Last run finished 3 minutes ago with no errors.</p>
    </CardContent>
  </Card>
);
