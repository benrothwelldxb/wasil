import { describe, expect, it } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { renderWithProviders, screen } from './render';

/** A probe component exercising both router params and a query. */
function Probe() {
  const { id } = useParams();
  const { data } = useQuery({
    queryKey: ['probe', id],
    queryFn: async () => `loaded-${id}`,
  });
  return (
    <div>
      <p>param: {id}</p>
      <p>{data ?? 'pending'}</p>
    </div>
  );
}

describe('renderWithProviders', () => {
  it('mounts a component with router params and query support', async () => {
    renderWithProviders(<Probe />, { route: '/items/42', path: '/items/:id' });

    expect(screen.getByText('param: 42')).toBeInTheDocument();
    expect(await screen.findByText('loaded-42')).toBeInTheDocument();
  });

  it('defaults to the root route', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByText(/param:/)).toBeInTheDocument();
  });
});
