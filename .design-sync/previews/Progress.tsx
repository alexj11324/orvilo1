import { Progress } from '@orvilo/ui';

const rows = [
  { label: 'Importing issues', value: 15 },
  { label: 'Indexing comments', value: 35 },
  { label: 'Syncing attachments', value: 72 },
  { label: 'Migration complete', value: 100 },
];

export const Values = () => (
  <div style={{ display: 'grid', gap: 16, width: 320 }}>
    {rows.map((row) => (
      <div key={row.label} style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>{row.label}</span>
          <span style={{ opacity: 0.6 }}>{row.value}%</span>
        </div>
        <Progress value={row.value} />
      </div>
    ))}
  </div>
);
