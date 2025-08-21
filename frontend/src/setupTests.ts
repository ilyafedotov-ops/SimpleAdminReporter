import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock window.getComputedStyle
Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn().mockImplementation(() => ({
    getPropertyValue: vi.fn().mockReturnValue(''),
    width: '0px',
    height: '0px',
    marginLeft: '0px',
    marginRight: '0px',
    paddingLeft: '0px',
    paddingRight: '0px',
    borderLeftWidth: '0px',
    borderRightWidth: '0px',
    display: 'block',
    position: 'static',
    overflow: 'visible',
  })),
})

// Mock XMLHttpRequest to prevent real network calls
Object.defineProperty(window, 'XMLHttpRequest', {
  value: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    readyState: 4,
    status: 200,
    response: '',
    responseText: '',
    onreadystatechange: null,
    abort: vi.fn(),
  })),
})

// Mock fetch to prevent real network calls
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
  } as globalThis.Response)
)

// Mock axios to prevent real network calls
vi.mock('axios', async () => {
  const actual = await vi.importActual('axios')
  return {
    ...actual,
    default: {
      create: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
        post: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
        put: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
        delete: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
        patch: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() },
        },
      })),
      get: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
      post: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
      put: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
      delete: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
      patch: vi.fn(() => Promise.resolve({ data: {}, status: 200 })),
    },
    isAxiosError: vi.fn(() => false),
  }
})

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  },
  writable: true,
})

// Mock URL.createObjectURL for file operations
Object.defineProperty(URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:mock-url'),
  writable: true,
})

Object.defineProperty(URL, 'revokeObjectURL', {
  value: vi.fn(),
  writable: true,
})

// Mock authService factory to prevent real service calls in slices
vi.mock('@/services/authService.factory', () => ({
  activeAuthService: {
    login: vi.fn(() => Promise.resolve({ success: true, data: { user: { id: '1', username: 'test' }, accessToken: 'test-token' } })),
    logout: vi.fn(() => Promise.resolve({ success: true })),
    refreshToken: vi.fn(() => Promise.resolve({ success: true, data: { accessToken: 'new-token' } })),
    getProfile: vi.fn(() => Promise.resolve({ success: true, data: { id: '1', username: 'test' } })),
    updateProfile: vi.fn(() => Promise.resolve({ success: true })),
    changePassword: vi.fn(() => Promise.resolve({ success: true })),
    getCurrentAuthState: vi.fn(() => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false
    })),
    hasPermission: vi.fn(() => true),
    hasRole: vi.fn(() => true),
    isAdmin: vi.fn(() => false),
    getAuthSource: vi.fn(() => 'mock'),
    setupTokenRefresh: vi.fn(),
  },
  login: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  getCurrentAuthState: vi.fn(() => ({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false
  })),
  hasPermission: vi.fn(),
  hasRole: vi.fn(),
  isAdmin: vi.fn(),
  getAuthSource: vi.fn(),
  setupTokenRefresh: vi.fn(),
}))

// Mock other services that slices might use
vi.mock('@/services/reportsService', () => ({
  reportsService: {
    getTemplates: vi.fn(() => Promise.resolve({ success: true, data: [] })),
    executeReport: vi.fn(() => Promise.resolve({ success: true, data: { results: [] } })),
    getHistory: vi.fn(() => Promise.resolve({ success: true, data: [] })),
  }
}))

vi.mock('@/services/queryService', () => ({
  queryService: {
    getDefinitions: vi.fn(() => Promise.resolve({ success: true, data: [] })),
    execute: vi.fn(() => Promise.resolve({ success: true, data: { results: [] } })),
    getSchema: vi.fn(() => Promise.resolve({ success: true, data: {} })),
  }
}))

// Mock console to reduce noise in tests
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks()
  
  // Mock console.error to suppress React error boundary messages
  console.error = vi.fn()
  console.warn = vi.fn()
})

afterEach(() => {
  // Restore console after each test
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
})