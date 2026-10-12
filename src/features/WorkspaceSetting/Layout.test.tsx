import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSettingsContentLayout } from './Layout';

vi.mock('@/features/NavHeader', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('header', undefined, children),
}));

vi.mock('./Container', () => ({
  default: ({ children, width }: { children?: React.ReactNode; width?: string }) =>
    React.createElement('main', { 'data-width': width }, children),
}));

vi.mock('@/features/Settings/Layout/SideBar', () => ({ default: () => null }));

// The single settings sidebar: workspace rows carry the workspace URL, and a
// row's key is its personal tab id (`stats`) rather than the URL segment.
vi.mock('@/features/Settings/hooks/useCategory', () => ({
  useCategory: () => [
    {
      items: [
        { href: '/acme/settings/general', key: 'general', label: 'General' },
        { href: '/acme/settings/members', key: 'members', label: 'Members' },
        { href: '/acme/settings/devices', key: 'devices', label: 'Devices' },
        { href: '/acme/settings/plans', key: 'plans', label: 'Plans' },
        { href: '/acme/settings/billing', key: 'billing', label: 'Billing' },
        { href: '/acme/settings/credits', key: 'credits', label: 'Credits' },
        { href: '/acme/settings/credential', key: 'credential', label: 'Credentials' },
        { href: '/acme/settings/statistics', key: 'stats', label: 'Statistics' },
        { href: '/acme/settings/usage', key: 'usage', label: 'Usage' },
        { key: 'profile', label: 'Jane Doe' },
      ],
    },
  ],
}));

const renderLayout = (tab: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/acme/settings/${tab}`]}>
      <Routes>
        <Route element={<WorkspaceSettingsContentLayout />} path="/:workspaceSlug/settings">
          <Route element={<div>Page content</div>} path=":tab" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('WorkspaceSettingsContentLayout', () => {
  it.each([
    ['general', 'form'],
    ['budget', 'form'],
    ['members', 'wide'],
    ['statistics', 'wide'],
    ['imports', 'wide'],
  ])('selects the %s page content lane as %s', (tab, width) => {
    expect(renderLayout(tab)).toContain(`data-width="${width}"`);
  });

  it.each([
    ['general', 'General'],
    ['members', 'Members'],
    ['devices', 'Devices'],
    ['plans', 'Plans'],
    ['billing', 'Billing'],
    ['credits', 'Credits'],
    ['credential', 'Credentials'],
    ['statistics', 'Statistics'],
    ['usage', 'Usage'],
  ])('renders the compact header for the %s tab', (tab, title) => {
    const html = renderLayout(tab);

    expect(html).toMatch(
      new RegExp(`<header>(?:(?!</header>).)*>${title}<(?:(?!<header>).)*</header>`),
    );
    expect(html).toMatch(/<main[^>]*><div>Page content<\/div><\/main>/);
  });

  it.each(['imports'])('keeps the %s tab on the content-only layout', (tab) => {
    const html = renderLayout(tab);

    expect(html).not.toContain('<header>');
    expect(html).toMatch(/<main[^>]*><div>Page content<\/div><\/main>/);
  });
});
