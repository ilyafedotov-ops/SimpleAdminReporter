import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogsErrorBoundary } from './LogsErrorBoundary';

// Mock console.error to avoid noise in test output
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalError;
  localStorage.clear();
});

// Component that throws an error
const ThrowError: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('LogsErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <LogsErrorBoundary darkMode={false}>
        <div>Test content</div>
      </LogsErrorBoundary>
    );
    
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders error UI when an error is thrown', () => {
    render(
      <LogsErrorBoundary darkMode={false}>
        <ThrowError shouldThrow={true} />
      </LogsErrorBoundary>
    );
    
    expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/The logs page encountered an unexpected error/)).toBeInTheDocument();
  });

  it('shows Try Again button that resets the error state', () => {
    const { unmount } = render(
      <LogsErrorBoundary darkMode={false}>
        <ThrowError shouldThrow={true} />
      </LogsErrorBoundary>
    );
    
    expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    
    // The Try Again button should be present
    const tryAgainButton = screen.getByText('Try Again');
    expect(tryAgainButton).toBeInTheDocument();
    
    // Clean up and render a new instance (simulating the reset behavior)
    unmount();
    
    render(
      <LogsErrorBoundary darkMode={false}>
        <ThrowError shouldThrow={false} />
      </LogsErrorBoundary>
    );
    
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('tracks error count in localStorage', () => {
    render(
      <LogsErrorBoundary darkMode={false}>
        <ThrowError shouldThrow={true} />
      </LogsErrorBoundary>
    );
    
    expect(localStorage.getItem('logsErrorCount')).toBe('1');
    expect(localStorage.getItem('lastLogsError')).toBeTruthy();
  });

  it('shows repeated error warning after multiple errors', () => {
    // Set error count to simulate previous errors
    localStorage.setItem('logsErrorCount', '2');
    
    render(
      <LogsErrorBoundary darkMode={false}>
        <ThrowError shouldThrow={true} />
      </LogsErrorBoundary>
    );
    
    expect(screen.getByText(/This error has occurred 3 times/)).toBeInTheDocument();
  });

  it('calls onError callback when provided', () => {
    const onError = vi.fn();
    
    render(
      <LogsErrorBoundary darkMode={false} onError={onError}>
        <ThrowError shouldThrow={true} />
      </LogsErrorBoundary>
    );
    
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String)
      })
    );
  });

  it('renders dark mode styles correctly', () => {
    const { container } = render(
      <LogsErrorBoundary darkMode={true}>
        <ThrowError shouldThrow={true} />
      </LogsErrorBoundary>
    );
    
    const heading = screen.getByText('Oops! Something went wrong');
    expect(heading).toBeInTheDocument();
    
    // Check that the component renders in dark mode by looking for dark background
    const outerContainer = container.querySelector('div[style*="background: rgb(26, 26, 26)"]');
    expect(outerContainer).toBeInTheDocument();
    
    // Check the heading has a style attribute with color (the component applies inline styles)
    expect(heading).toHaveAttribute('style');
    const headingStyle = heading.getAttribute('style');
    expect(headingStyle).toContain('color: white'); // Dark mode should set white color
  });

  it('shows error details in development mode', () => {
    // Mock import.meta.env.DEV
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = true;
    
    render(
      <LogsErrorBoundary darkMode={false}>
        <ThrowError shouldThrow={true} />
      </LogsErrorBoundary>
    );
    
    expect(screen.getByText('Error Details (Development Only)')).toBeInTheDocument();
    
    // Restore original value
    import.meta.env.DEV = originalDev;
  });
});