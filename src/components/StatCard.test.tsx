import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StatCard from './StatCard';

const stats = { latest: 35.2, min: 20, max: 36, avg: 27 };

describe('StatCard', () => {
  it('shows value, unit and a "Too high" badge when over threshold', () => {
    render(<StatCard metric="temperature" stats={stats} threshold={{ min: 15, max: 30 }} onSelect={() => {}} />);
    expect(screen.getByTestId('value-temperature')).toHaveTextContent('35.2°C');
    expect(screen.getByText('Too high')).toBeInTheDocument();
  });

  it('shows "In range" and calls onSelect on click', () => {
    const onSelect = vi.fn();
    render(<StatCard metric="humidity" stats={{ ...stats, latest: 40 }} threshold={{ min: 25, max: 65 }} onSelect={onSelect} />);
    expect(screen.getByText('In range')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('humidity');
  });
});
