import { waitFor } from '@testing-library/react';
import { store } from '@/store';
import { loginAsync } from '@/store/slices/authSlice';

// Test credentials - should be configured in your test environment
export const TEST_CREDENTIALS = {
  username: process.env.TEST_USERNAME || 'testuser',
  password: process.env.TEST_PASSWORD || 'testpass',
  authSource: 'ad' as const,
};

// Wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Login helper for tests that require authentication
export const loginForTest = async () => {
  const result = await store.dispatch(loginAsync(TEST_CREDENTIALS));
  if (loginAsync.rejected.match(result)) {
    throw new Error(`Login failed: ${result.payload}`);
  }
  return result.payload;
};

// Wait for API response
export const waitForApiResponse = async (condition: () => boolean, timeout = 5000) => {
  await waitFor(condition, { timeout });
};

// Check if user is authenticated
export const isAuthenticated = () => {
  const state = store.getState();
  return state.auth.isAuthenticated;
};

// Clear all data and logout
export const cleanupAfterTest = async () => {
  const state = store.getState();
  if (state.auth.isAuthenticated) {
    // Logout will be handled by the auth service
    localStorage.clear();
    sessionStorage.clear();
  }
};

// Wait for component to be ready
export const waitForComponentReady = async (testId: string) => {
  await waitFor(() => {
    const element = document.querySelector(`[data-testid="${testId}"]`);
    return element !== null;
  });
};

// Retry helper for flaky operations
export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> => {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};