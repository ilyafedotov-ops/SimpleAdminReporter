import { vi } from 'vitest'
import { ApiResponse, PaginatedResponse, HealthCheck, User } from '@/types'

// Mock user data
export const mockUser: User = {
  id: '1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  roles: ['user'],
  permissions: ['read:reports'],
  authSource: 'ad' as const,
  isActive: true
}

// Mock API responses
export const mockApiResponses = {
  // Auth responses
  auth: {
    success: {
      success: true,
      data: {
        user: mockUser,
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 3600
      }
    } as ApiResponse,
    
    method: {
      success: true,
      data: { method: 'cookie' }
    } as ApiResponse<{ method: string }>,
    
    logout: {
      success: true,
      message: 'Logged out successfully'
    } as ApiResponse<void>
  },

  // Health check responses
  health: {
    success: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: 3600,
      services: {
        database: 'healthy',
        redis: 'healthy',
        ldap: 'healthy'
      }
    } as HealthCheck
  },

  // Report responses
  reports: {
    execute: {
      success: true,
      data: {
        queryId: 'template-1',
        results: [
          { id: 1, name: 'Test Report', status: 'active' },
          { id: 2, name: 'Another Report', status: 'inactive' }
        ],
        totalCount: 2,
        executionTime: 150
      }
    } as ApiResponse,

    templates: {
      success: true,
      data: [
        {
          id: 'template-1',
          name: 'User Activity Report',
          description: 'Shows user activity metrics',
          category: 'users',
          fields: ['username', 'lastLogin', 'status']
        }
      ]
    } as ApiResponse<any[]>
  },

  // Query responses
  query: {
    definitions: {
      success: true,
      data: [
        {
          id: 'query-1',
          name: 'Sample Query',
          description: 'A sample query definition',
          fields: ['field1', 'field2']
        }
      ]
    } as ApiResponse<any[]>,

    schema: {
      success: true,
      data: {
        tables: ['users', 'groups'],
        fields: {
          users: ['id', 'username', 'email', 'displayName'],
          groups: ['id', 'name', 'description']
        }
      }
    } as ApiResponse<any>
  },

  // Logs responses
  logs: {
    audit: {
      success: true,
      data: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          action: 'login',
          username: 'testuser',
          ipAddress: '192.168.1.1'
        }
      ],
      totalCount: 1,
      page: 1,
      pageSize: 10
    } as PaginatedResponse<any>,

    system: {
      success: true,
      data: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'System started',
          service: 'api'
        }
      ],
      totalCount: 1,
      page: 1,
      pageSize: 10
    } as PaginatedResponse<any>
  },

  // Generic responses
  generic: {
    success: {
      success: true,
      data: null
    } as ApiResponse<null>,

    error: {
      success: false,
      error: 'Test error message'
    } as ApiResponse<null>
  }
}

// Mock API service
export const createMockApiService = () => ({
  // HTTP methods
  get: vi.fn().mockResolvedValue(mockApiResponses.generic.success),
  post: vi.fn().mockResolvedValue(mockApiResponses.generic.success),
  put: vi.fn().mockResolvedValue(mockApiResponses.generic.success),
  delete: vi.fn().mockResolvedValue(mockApiResponses.generic.success),
  patch: vi.fn().mockResolvedValue(mockApiResponses.generic.success),

  // Specialized methods
  getPaginated: vi.fn().mockResolvedValue(mockApiResponses.logs.audit),
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(mockApiResponses.generic.success),
  healthCheck: vi.fn().mockResolvedValue(mockApiResponses.health.success),

  // Configuration
  getBaseURL: vi.fn().mockReturnValue('/api'),
  updateBaseURL: vi.fn(),
})

// Mock store state
export const mockStoreState = {
  auth: {
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    token: 'mock-token',
    refreshToken: 'mock-refresh-token',
    error: null
  },
  ui: {
    theme: {
      darkMode: false,
      primaryColor: '#1890ff'
    },
    sidebar: {
      collapsed: false
    }
  },
  reports: {
    loading: false,
    error: null,
    templates: [],
    currentReport: null,
    history: []
  },
  query: {
    loading: false,
    error: null,
    definitions: [],
    results: null,
    schema: null
  }
}

// Mock hooks returns
export const mockHookReturns = {
  useNotifications: {
    stats: {
      totalCount: 10,
      unreadCount: 3,
      highPriorityUnread: 1,
      recentCount: 5
    },
    notifications: [],
    loading: false,
    error: null,
    fetchNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    dismissNotification: vi.fn()
  }
}

// Utility to setup axios mock
export const setupAxiosMock = () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }
  
  // Configure default responses
  mockAxios.get.mockResolvedValue({ data: mockApiResponses.generic.success })
  mockAxios.post.mockResolvedValue({ data: mockApiResponses.generic.success })
  mockAxios.put.mockResolvedValue({ data: mockApiResponses.generic.success })
  mockAxios.delete.mockResolvedValue({ data: mockApiResponses.generic.success })
  mockAxios.patch.mockResolvedValue({ data: mockApiResponses.generic.success })
  
  return mockAxios
}

// Mock service functions for common services
export const mockServices = {
  searchService: {
    globalSearch: vi.fn().mockResolvedValue([
      {
        id: '1',
        title: 'Test Report',
        description: 'A test report',
        type: 'report',
        path: '/reports/1'
      }
    ])
  },
  
  authService: {
    login: vi.fn().mockResolvedValue(mockApiResponses.auth.success),
    logout: vi.fn().mockResolvedValue(mockApiResponses.auth.logout),
    refreshToken: vi.fn().mockResolvedValue(mockApiResponses.auth.success),
    checkAuthMethod: vi.fn().mockResolvedValue(mockApiResponses.auth.method),
    getCurrentUser: vi.fn().mockReturnValue(mockUser),
    isAuthenticated: vi.fn().mockReturnValue(true),
    getToken: vi.fn().mockReturnValue('mock-token')
  },
  
  reportsService: {
    getTemplates: vi.fn().mockResolvedValue(mockApiResponses.reports.templates),
    executeReport: vi.fn().mockResolvedValue(mockApiResponses.reports.execute),
    getHistory: vi.fn().mockResolvedValue(mockApiResponses.logs.audit)
  },
  
  queryService: {
    getDefinitions: vi.fn().mockResolvedValue(mockApiResponses.query.definitions),
    getSchema: vi.fn().mockResolvedValue(mockApiResponses.query.schema),
    execute: vi.fn().mockResolvedValue(mockApiResponses.reports.execute)
  }
}