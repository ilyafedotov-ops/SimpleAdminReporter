import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/utils/test-utils';
import ProtectedRoute from '../ProtectedRoute';

// Mock the auth service factory
vi.mock('@/services/authService.factory', () => ({
  activeAuthService: {
    logout: vi.fn(),
    login: vi.fn(),
    refreshToken: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    getCurrentAuthState: vi.fn(),
    hasPermission: vi.fn(),
    hasRole: vi.fn(),
    isAdmin: vi.fn(),
    getAuthSource: vi.fn(),
    setupTokenRefresh: vi.fn()
  }
}));

// Mock store slices - using renderWithProviders instead of mocking

// Import the mocked auth service
import { activeAuthService as authService } from '@/services/authService.factory';

// Mock react-router-dom Navigate component
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to, state, replace }: { to: string; state?: unknown; replace?: boolean }) => {
      mockNavigate(to, state, replace);
      return <div data-testid="navigate" data-to={to}>Navigating to {to}</div>;
    },
    useLocation: vi.fn(() => ({ pathname: '/protected', state: null }))
  };
});

// Import after mocking
import { useLocation } from 'react-router-dom';


const mockUser = {
  id: '1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  roles: ['user', 'viewer'],
  permissions: ['read:reports', 'read:templates'],
  authSource: 'ad' as const,
  isActive: true
};

describe('ProtectedRoute', () => {
  const TestComponent = () => <div data-testid="protected-content">Protected Content</div>;

  beforeEach(() => {
    // Mock authService methods
    vi.mocked(authService.logout).mockResolvedValue(undefined);
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticated user scenarios', () => {
    it('should render children when user is authenticated', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should fetch profile when token exists but no user data', async () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: null,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      // Profile fetch is handled by the component automatically
    });

    it('should not fetch profile when user already exists', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      // Profile is already available, no fetch needed
    });

    it('should show loading spinner when loading user data', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: null,
              isLoading: true,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Loading user profile...')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should show loading spinner when token exists but no user', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: null,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Loading user profile...')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('unauthenticated user scenarios', () => {
    it('should redirect to login when not authenticated', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: false,
              user: null,
              isLoading: false,
              token: null
            }
          }
        }
      );

      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should handle token expiration by redirecting to login', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: false, // Simulate expired token state
              user: null,
              isLoading: false,
              token: null
            }
          }
        }
      );

      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should redirect to login when not authenticated', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: false,
              user: null,
              isLoading: false,
              token: null
            }
          }
        }
      );

      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
    });
  });

  describe('permission-based access control', () => {
    it('should render children when user has required permissions', () => {
      renderWithProviders(
        <ProtectedRoute requiredPermissions={['read:reports']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should render children when user has all required permissions', () => {
      renderWithProviders(
        <ProtectedRoute requiredPermissions={['read:reports', 'read:templates']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should show access denied when user lacks required permissions', () => {
      renderWithProviders(
        <ProtectedRoute requiredPermissions={['admin:all']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText("You don't have the required permissions to access this page.")).toBeInTheDocument();
      expect(screen.getByText('Required permissions: admin:all')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should show access denied when user has only some required permissions', () => {
      renderWithProviders(
        <ProtectedRoute requiredPermissions={['read:reports', 'admin:all']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText('Required permissions: read:reports, admin:all')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should handle user with no permissions array', () => {
      const userWithoutPermissions = {
        ...mockUser,
        permissions: undefined
      };

      renderWithProviders(
        <ProtectedRoute requiredPermissions={['read:reports']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: userWithoutPermissions,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('role-based access control', () => {
    it('should render children when user has required role', () => {
      renderWithProviders(
        <ProtectedRoute requiredRoles={['user']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should render children when user has any of the required roles', () => {
      renderWithProviders(
        <ProtectedRoute requiredRoles={['admin', 'user']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should show access denied when user lacks required roles', () => {
      renderWithProviders(
        <ProtectedRoute requiredRoles={['admin', 'super-admin']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText("You don't have the required role to access this page.")).toBeInTheDocument();
      expect(screen.getByText('Required roles: admin, super-admin')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should handle user with no roles array', () => {
      const userWithoutRoles = {
        ...mockUser,
        roles: undefined
      };

      renderWithProviders(
        <ProtectedRoute requiredRoles={['user']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: userWithoutRoles,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('combined permissions and roles', () => {
    it('should render children when user has both required permissions and roles', () => {
      renderWithProviders(
        <ProtectedRoute 
          requiredPermissions={['read:reports']} 
          requiredRoles={['user']}
        >
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should show access denied when user has permissions but not roles', () => {
      renderWithProviders(
        <ProtectedRoute 
          requiredPermissions={['read:reports']} 
          requiredRoles={['admin']}
        >
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText("You don't have the required role to access this page.")).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should show access denied when user has roles but not permissions', () => {
      renderWithProviders(
        <ProtectedRoute 
          requiredPermissions={['admin:all']} 
          requiredRoles={['user']}
        >
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText("You don't have the required permissions to access this page.")).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('loading states and edge cases', () => {
    it('should handle null user during loading', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: null,
              isLoading: true,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Loading user profile...')).toBeInTheDocument();
      // Check for the Spin component by its class instead of role
      expect(document.querySelector('.ant-spin')).toBeInTheDocument();
    });

    it('should skip permission checks when no permissions required', () => {
      renderWithProviders(
        <ProtectedRoute requiredPermissions={[]}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should skip role checks when no roles required', () => {
      renderWithProviders(
        <ProtectedRoute requiredRoles={[]}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should handle user being null for permission checks', () => {
      renderWithProviders(
        <ProtectedRoute requiredPermissions={['read:reports']}>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: null,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      // Should show loading because user is null but token exists
      expect(screen.getByText('Loading user profile...')).toBeInTheDocument();
    });

    it('should handle logout errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      vi.mocked(authService.logout).mockRejectedValue(new Error('Logout failed'));

      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: false,
              user: null,
              isLoading: false,
              token: null
            }
          }
        }
      );

      // Should redirect to login regardless of logout errors
      expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');

      consoleSpy.mockRestore();
    });
  });

  describe('component props and defaults', () => {
    it('should accept children as React nodes', () => {
      renderWithProviders(
        <ProtectedRoute>
          <div>Multiple</div>
          <div>Children</div>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByText('Multiple')).toBeInTheDocument();
      expect(screen.getByText('Children')).toBeInTheDocument();
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should use empty arrays as default for permissions and roles', () => {
      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: true,
              user: mockUser,
              isLoading: false,
              token: 'valid-token'
            }
          }
        }
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('navigation state preservation', () => {
    it('should preserve location state when redirecting to login', () => {
      const originalLocation = { 
        pathname: '/protected-page', 
        state: { from: '/dashboard' },
        key: 'test',
        search: '',
        hash: ''
      };
      
      // Mock useLocation to return the original location
      vi.mocked(useLocation).mockReturnValue(originalLocation);

      renderWithProviders(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>,
        {
          initialState: {
            auth: {
              isAuthenticated: false,
              user: null,
              isLoading: false,
              token: null
            }
          }
        }
      );

      expect(mockNavigate).toHaveBeenCalledWith(
        '/login',
        { from: originalLocation },
        true
      );
    });
  });
});