import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LiteTable, { type LiteTableColumn } from './index';

interface Row {
  id: string;
  name: string;
  owner: string;
}

const columns: LiteTableColumn<Row>[] = [
  { key: 'name', render: (row) => row.name, title: 'Name' },
  { key: 'owner', render: (row) => row.owner, title: 'Owner', width: 160 },
];

describe('LiteTable sections', () => {
  it('renders one shared thead across all sections', () => {
    const { container } = render(
      <LiteTable
        columns={columns}
        rowKey={(row) => row.id}
        sections={[
          {
            header: 'Personal views · Only visible to you',
            items: [{ id: '1', name: 'Alpha', owner: 'me' }],
            key: 'personal',
          },
          {
            footer: 'Create private issue view…',
            header: 'Shared views · Shared with your workspace or team',
            items: [{ id: '2', name: 'Beta', owner: 'you' }],
            key: 'shared',
          },
        ]}
      />,
    );

    // One header row, two bodies — never a second <thead> or table.
    expect(container.querySelectorAll('thead tr')).toHaveLength(1);
    expect(container.querySelectorAll('tbody')).toHaveLength(2);
    expect(screen.getByText('Personal views · Only visible to you')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    const sectionRows = container.querySelectorAll('tr[data-list-section]');
    // personal header + shared header + shared footer
    expect(sectionRows).toHaveLength(3);
    for (const row of sectionRows) {
      expect(row.querySelectorAll('td')).toHaveLength(1);
      expect(row.querySelector('td')?.getAttribute('colspan')).toBe('2');
    }
  });

  it('keeps the flat dataSource path working', () => {
    const { container } = render(
      <LiteTable
        columns={columns}
        dataSource={[{ id: '1', name: 'Solo', owner: 'me' }]}
        rowKey={(row) => row.id}
      />,
    );
    expect(container.querySelectorAll('tbody')).toHaveLength(1);
    expect(container.querySelectorAll('tr[data-list-section]')).toHaveLength(0);
    expect(screen.getByText('Solo')).toBeInTheDocument();
  });

  it('fires onRowClick for section items', () => {
    const onRowClick = vi.fn();
    render(
      <LiteTable
        columns={columns}
        rowKey={(row) => row.id}
        sections={[
          {
            items: [{ id: '1', name: 'Alpha', owner: 'me' }],
            key: 'personal',
          },
        ]}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getByText('Alpha'));
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'Alpha', owner: 'me' });
  });

  it('renders emptyText only when no section has chrome or rows', () => {
    const { container, rerender } = render(
      <LiteTable
        columns={columns}
        emptyText="nothing here"
        rowKey={(row) => row.id}
        sections={[{ items: [], key: 'personal' }]}
      />,
    );
    expect(screen.getByText('nothing here')).toBeInTheDocument();

    rerender(
      <LiteTable
        columns={columns}
        emptyText="nothing here"
        rowKey={(row) => row.id}
        sections={[{ footer: 'Create private issue view…', items: [], key: 'personal' }]}
      />,
    );
    // The create entry keeps the table alive even with zero records.
    expect(screen.queryByText('nothing here')).not.toBeInTheDocument();
    expect(screen.getByText('Create private issue view…')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr[data-list-section]')).toHaveLength(1);
  });
});
