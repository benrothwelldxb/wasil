import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlagName } from '@/config/flags';

vi.mock('@/config/flags', () => ({
  isEnabled: vi.fn(),
}));

import { isEnabled } from '@/config/flags';
import { Flag } from '@/components/shared/Flag';
import { useFlag } from '@/hooks/use-flag';

const isEnabledMock = vi.mocked(isEnabled);

beforeEach(() => {
  isEnabledMock.mockReset();
});

function Probe({ name }: { name: FlagName }) {
  return <span data-testid="flag-value">{String(useFlag(name))}</span>;
}

describe('useFlag', () => {
  it('returns true when the resolved snapshot has the flag enabled', () => {
    isEnabledMock.mockReturnValue(true);

    render(<Probe name="debugPanel" />);

    expect(screen.getByTestId('flag-value')).toHaveTextContent('true');
    expect(isEnabledMock).toHaveBeenCalledWith('debugPanel');
  });

  it('returns false when the resolved snapshot has the flag disabled', () => {
    isEnabledMock.mockReturnValue(false);

    render(<Probe name="debugPanel" />);

    expect(screen.getByTestId('flag-value')).toHaveTextContent('false');
  });
});

describe('Flag', () => {
  it('renders children when the flag is enabled', () => {
    isEnabledMock.mockReturnValue(true);

    render(
      <Flag name="queryDevtools" fallback={<span>fallback</span>}>
        <span>children</span>
      </Flag>,
    );

    expect(screen.getByText('children')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('renders the fallback when the flag is disabled', () => {
    isEnabledMock.mockReturnValue(false);

    render(
      <Flag name="queryDevtools" fallback={<span>fallback</span>}>
        <span>children</span>
      </Flag>,
    );

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByText('children')).not.toBeInTheDocument();
  });

  it('renders nothing when disabled and no fallback is given', () => {
    isEnabledMock.mockReturnValue(false);

    const { container } = render(
      <Flag name="queryDevtools">
        <span>children</span>
      </Flag>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
