import { render, screen, fireEvent } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import App from './App';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('App', () => {
  it('renders devices, all four metrics and the alerts panel', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /EnvSense/ })).toBeInTheDocument();
    for (const id of ['temperature', 'humidity', 'pressure', 'co2']) {
      expect(screen.getByTestId(`value-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Lab Bench/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Alerts')).toBeInTheDocument();
  });

  it('pauses and resumes the stream', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('lowering a threshold raises the badge to "Too high"', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Temperature maximum'), { target: { value: '-50' } });
    expect(screen.getAllByText('Too high').length).toBeGreaterThan(0);
  });
});
