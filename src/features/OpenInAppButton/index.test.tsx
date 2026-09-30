import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OpenInAppButton from './index';

const launchMock = vi.fn();
let hookReturn: {
  defaultApp: string;
  installedApps: { displayName: string; icon?: string; id: string; installed: boolean }[];
  launch: typeof launchMock;
  ready: boolean;
};
let isDesktopValue = true;

vi.mock('@orvilo/const', () => ({
  get isDesktop() {
    return isDesktopValue;
  },
}));

vi.mock('./useOpenInApp', () => ({
  useOpenInApp: () => hookReturn,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}::${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div data-testid="tooltip">{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render }: { render: ReactNode }) => <>{render}</>,
}));

vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({
    children,
    items,
  }: {
    children: ReactNode;
    items?: { icon?: ReactNode; key: string; label: ReactNode; onClick?: () => void }[];
  }) => (
    <div data-testid="dropdown-root">
      <div data-testid="dropdown-trigger">{children}</div>
      <ul data-testid="dropdown-items">
        {items?.map((item) => (
          <li
            data-item-id={item.key}
            data-testid={`dropdown-item-${item.key}`}
            key={item.key}
            onClick={() => item.onClick?.()}
          >
            {item.icon}
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

beforeEach(() => {
  isDesktopValue = true;
  launchMock.mockReset();
  hookReturn = {
    defaultApp: 'vscode',
    installedApps: [
      { displayName: 'VS Code', id: 'vscode', installed: true },
      { displayName: 'Finder', id: 'finder', installed: true },
    ],
    launch: launchMock,
    ready: true,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('<OpenInAppButton />', () => {
  it('returns null on web build (isDesktop=false)', () => {
    isDesktopValue = false;
    const { container } = render(<OpenInAppButton workingDirectory="/tmp/proj" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when workingDirectory is empty', () => {
    const { container } = render(<OpenInAppButton workingDirectory="" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null while detection is pending', () => {
    hookReturn = { ...hookReturn, ready: false };
    const { container } = render(<OpenInAppButton workingDirectory="/tmp/proj" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the split button with the default app icon when ready', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-root')).toBeInTheDocument();
  });

  it('calls launch(defaultApp) when the left half is clicked', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    const leftButton = screen.getByLabelText(/tooltip/);
    fireEvent.click(leftButton);

    expect(launchMock).toHaveBeenCalledWith('vscode');
  });

  it('lists only installed apps in the dropdown', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    const items = screen.getAllByTestId(/dropdown-item-/);
    expect(items).toHaveLength(2);
    expect(items.map((el) => el.getAttribute('data-item-id'))).toEqual(['vscode', 'finder']);
  });

  it('invokes launch(appId) when a dropdown item is clicked', () => {
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    fireEvent.click(screen.getByTestId('dropdown-item-finder'));

    expect(launchMock).toHaveBeenCalledWith('finder');
  });

  it('renders extracted base64 icon as an <img> for the default app', () => {
    hookReturn = {
      ...hookReturn,
      installedApps: [
        {
          displayName: 'VS Code',
          icon: 'data:image/png;base64,VSCODE',
          id: 'vscode',
          installed: true,
        },
        { displayName: 'Finder', id: 'finder', installed: true },
      ],
    };

    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    const leftButton = screen.getByLabelText(/tooltip/);
    const img = leftButton.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,VSCODE');
  });

  it('falls back to the lucide icon when no base64 icon is available', () => {
    // default hookReturn has no icon fields
    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    const leftButton = screen.getByLabelText(/tooltip/);
    expect(leftButton.querySelector('img')).toBeNull();
    expect(leftButton.querySelector('svg')).not.toBeNull();
  });

  it('renders base64 icon for dropdown items when available', () => {
    hookReturn = {
      ...hookReturn,
      installedApps: [
        {
          displayName: 'VS Code',
          icon: 'data:image/png;base64,VSCODE',
          id: 'vscode',
          installed: true,
        },
        { displayName: 'Finder', id: 'finder', installed: true },
      ],
    };

    render(<OpenInAppButton workingDirectory="/tmp/proj" />);

    const vscodeItem = screen.getByTestId('dropdown-item-vscode');
    const finderItem = screen.getByTestId('dropdown-item-finder');

    expect(vscodeItem.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,VSCODE',
    );
    expect(finderItem.querySelector('img')).toBeNull();
    expect(finderItem.querySelector('svg')).not.toBeNull();
  });
});
