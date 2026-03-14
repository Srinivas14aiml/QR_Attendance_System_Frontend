import { render, screen } from '@testing-library/react';
import App from './App';

test('renders smart attendance heading', () => {
  render(<App />);
  expect(screen.getByText(/smart attendance/i)).toBeInTheDocument();
});
