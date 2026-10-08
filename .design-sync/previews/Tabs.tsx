import { Tabs, TabsContent, TabsList, TabsTrigger } from '@orvilo/ui';

export const Default = () => (
  <Tabs defaultValue="overview" style={{ width: 360 }}>
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="issues">Issues</TabsTrigger>
      <TabsTrigger value="activity">Activity</TabsTrigger>
    </TabsList>
    <TabsContent value="overview">
      <p style={{ fontSize: 14 }}>
        Project health, milestones and the people working on this cycle.
      </p>
    </TabsContent>
    <TabsContent value="issues">
      <p style={{ fontSize: 14 }}>All open issues grouped by status.</p>
    </TabsContent>
    <TabsContent value="activity">
      <p style={{ fontSize: 14 }}>Recent comments, status changes and merges.</p>
    </TabsContent>
  </Tabs>
);

export const Line = () => (
  <Tabs defaultValue="all" style={{ width: 360 }}>
    <TabsList variant="line">
      <TabsTrigger value="all">All</TabsTrigger>
      <TabsTrigger value="mine">Assigned to me</TabsTrigger>
    </TabsList>
    <TabsContent value="all">
      <p style={{ fontSize: 14 }}>Every task in the workspace.</p>
    </TabsContent>
    <TabsContent value="mine">
      <p style={{ fontSize: 14 }}>Tasks assigned to you.</p>
    </TabsContent>
  </Tabs>
);
