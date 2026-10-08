import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@orvilo/ui';

const issues = [
  {
    id: 'ORV-142',
    title: 'Sidebar collapses on narrow windows',
    status: 'In review',
    owner: 'Maya K.',
  },
  {
    id: 'ORV-139',
    title: 'Agent run times out after 10 minutes',
    status: 'In progress',
    owner: 'Alex J.',
  },
  { id: 'ORV-131', title: 'Add keyboard shortcut for new issue', status: 'Done', owner: 'Ravi S.' },
];

export const Issues = () => (
  <div style={{ width: 560 }}>
    <Table>
      <TableCaption>Issues updated this week</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Owner</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((issue) => (
          <TableRow key={issue.id}>
            <TableCell>{issue.id}</TableCell>
            <TableCell>{issue.title}</TableCell>
            <TableCell>
              <Badge variant={issue.status === 'Done' ? 'success-light' : 'info-light'}>
                {issue.status}
              </Badge>
            </TableCell>
            <TableCell>{issue.owner}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
