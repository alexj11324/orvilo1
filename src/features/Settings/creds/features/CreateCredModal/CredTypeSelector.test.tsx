/** @vitest-environment happy-dom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CredTypeSelector from './CredTypeSelector';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('credential creation types', () => {
  it('offers local KV and file credentials without platform OAuth installation', () => {
    const select = vi.fn();
    render(<CredTypeSelector onSelect={select} />);
    expect(screen.queryByText('creds.types.oauth')).toBeNull();
    fireEvent.click(screen.getByText('creds.types.kv-env'));
    fireEvent.click(screen.getByText('creds.types.file'));
    expect(select.mock.calls).toEqual([['kv-env'], ['file']]);
    expect(screen.getByText('creds.types.kv-header')).toBeInTheDocument();
  });
});
