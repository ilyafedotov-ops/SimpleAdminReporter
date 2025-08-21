/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import axios, { AxiosInstance, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiResponse, PaginatedResponse, HealthCheck } from '@/types';
import { parseError, logError } from '@/utils/errorHandler';
import { queueApiCall, ApiPriority } from '@/utils/apiQueue';
import { queryCache, createCacheKey } from '@/utils/apiCache';
import { cookieAuthService } from './authService.cookie';

// Extend AxiosRequestConfig to include our custom properties
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _skipCSRF?: boolean; // Skip CSRF for specific requests
}

class CookieApiService {
  public client: AxiosInstance;
  private baseURL: string;
  private isUsingCookies: boolean = false;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_URL || '/api';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Important: Send cookies with requests
    });

    this.setupInterceptors();
    this.checkAuthMethod();
  }

  private async checkAuthMethod(): Promise<void> {
    try {
      const response = await this.client.get('/auth/method');
      if (((response as any).data)?.data?.method === 'cookie') {
        this.isUsingCookies = true;
        // Set header to indicate we accept cookies
        this.client.defaults.headers.common['X-Accept-Cookies'] = 'true';
      }
    } catch (error) {
      console.error('Failed to check auth method:', error);
    }
  }

  private setupInterceptors(): void {
    // Request interceptor to add auth token and CSRF token
    this.client.interceptors.request.use(
      (config: CustomAxiosRequestConfig) => {
        // For cookie-based auth, add CSRF token for state-changing requests
        if (this.isUsingCookies && !config._skipCSRF) {
          const method = config.method?.toUpperCase();
          if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            const csrfToken = cookieAuthService.getCSRFToken();
            if (csrfToken) {
              config.headers['X-CSRF-Token'] = csrfToken;
            }
          }
        }
        
        // For migration support, still add Bearer token if it exists
        const token = localStorage.getItem('accessToken');
        if (token && !this.isUsingCookies) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle common errors and token refresh
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Check if server suggests token refresh
        if (response.headers['x-token-refresh-suggested'] === 'true') {
          // Trigger token refresh in background
          cookieAuthService.refreshToken().catch(err => {
            console.error('Background token refresh failed:', err);
          });
        }
        
        return response;
      },
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          const config = ((error as any)?.config) as CustomAxiosRequestConfig;
          
          // Don't try to refresh for the refresh endpoint itself
          if (config?.url?.includes('/auth/refresh')) {
            // For cookie auth, just redirect to login
            if (this.isUsingCookies) {
              window.location.href = '/login';
            } else {
              // Legacy token cleanup
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
              window.location.href = '/login';
            }
            return Promise.reject(error);
          }
          
          // Try to refresh token
          if (!config?._retry) {
            config._retry = true; // Mark that we've tried to refresh
            
            try {
              if (this.isUsingCookies) {
                // For cookie auth, just call refresh endpoint
                await cookieAuthService.refreshToken();
                
                // Retry the original request
                return this.client.request(config);
              } else {
                // Legacy token refresh
                const refreshToken = localStorage.getItem('refreshToken');
                if (refreshToken) {
                  const response = await this.refreshAccessToken(refreshToken);
                  localStorage.setItem('accessToken', ((response as any).data).accessToken);
                  if (((response as any).data).refreshToken) {
                    localStorage.setItem('refreshToken', ((response as any).data).refreshToken);
                  }
                  
                  // Retry the original request
                  if (config) {
                    config.headers.Authorization = `Bearer ${((response as any).data).accessToken}`;
                    return this.client.request(config);
                  }
                }
              }
            } catch (_refreshError) {
              // Refresh failed, redirect to login
              if (this.isUsingCookies) {
                await cookieAuthService.logout();
              } else {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');
              }
              window.location.href = '/login';
            }
          } else {
            // Already retried, redirect to login
            if (this.isUsingCookies) {
              await cookieAuthService.logout();
            } else {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
            }
            window.location.href = '/login';
          }
        }
        
        // Handle CSRF errors
        if (error.response?.status === 403 && error.response?.data?.message?.includes('CSRF')) {
          // Try to get a new CSRF token and retry
          if (!((error as any)?.config)?._retry) {
            const config = (error as any)?.config;
            if (config) {
              config._retry = true;
            }
            try {
              await cookieAuthService.refreshToken();
              const config = (error as any)?.config;
              if (config) {
                return this.client.request(config);
              }
            } catch (_csrfError) {
              console.error('Failed to refresh CSRF token:', _csrfError);
            }
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(refreshToken: string): Promise<AxiosResponse> {
    return this.client.post('/auth/refresh', { refreshToken });
  }

  // Generic HTTP methods
  async get<T = unknown>(
    url: string, 
    params?: Record<string, unknown>,
    options?: { 
      useCache?: boolean;
      cacheTTL?: number;
      priority?: number;
      immediate?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    const { useCache = true, cacheTTL, priority = ApiPriority.NORMAL, immediate = false } = options || {};
    
    // Check cache first
    if (useCache) {
      const cacheKey = createCacheKey(url, params);
      const cached = queryCache.get<ApiResponse<T>>(cacheKey);
      if (cached) {
        console.log(`Cache hit for ${url}`);
        return cached;
      }
    }
    
    // Queue the request
    return queueApiCall(async () => {
      try {
        const response = await this.client.get(url, { params });
        
        // Cache successful responses
        if (useCache && ((response as any).data)) {
          const cacheKey = createCacheKey(url, params);
          queryCache.set(cacheKey, ((response as any).data), cacheTTL);
        }
        
        return ((response as any).data);
      } catch (error) {
        throw this.handleError(error);
      }
    }, { priority, immediate });
  }

  async post<T = unknown>(
    url: string, 
    data?: unknown,
    options?: { 
      priority?: number; 
      immediate?: boolean;
      skipCSRF?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    const { priority = ApiPriority.NORMAL, immediate = false, skipCSRF = false } = options || {};
    
    return queueApiCall(async () => {
      try {
        const config: CustomAxiosRequestConfig = {
          _skipCSRF: skipCSRF
        } as any;
        
        const response = await this.client.post(url, data, config);
        return ((response as any).data);
      } catch (error) {
        throw this.handleError(error);
      }
    }, { priority, immediate });
  }

  async put<T = unknown>(
    url: string, 
    data?: unknown,
    options?: { skipCSRF?: boolean }
  ): Promise<ApiResponse<T>> {
    try {
      const config: CustomAxiosRequestConfig = {
        _skipCSRF: options?.skipCSRF || false
      } as any;
      
      const response = await this.client.put(url, data, config);
      return ((response as any).data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async delete<T = unknown>(
    url: string,
    options?: { skipCSRF?: boolean }
  ): Promise<ApiResponse<T>> {
    try {
      const config: CustomAxiosRequestConfig = {
        _skipCSRF: options?.skipCSRF || false
      } as any;
      
      const response = await this.client.delete(url, config);
      return ((response as any).data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getPaginated<T = unknown>(
    url: string, 
    params?: Record<string, unknown>,
    options?: { 
      useCache?: boolean;
      cacheTTL?: number;
      priority?: number;
    }
  ): Promise<PaginatedResponse<T>> {
    const { useCache = true, cacheTTL, priority = ApiPriority.NORMAL } = options || {};
    
    // Check cache first
    if (useCache) {
      const cacheKey = createCacheKey(`paginated:${url}`, params);
      const cached = queryCache.get<PaginatedResponse<T>>(cacheKey);
      if (cached) {
        console.log(`Cache hit for paginated ${url}`);
        return cached;
      }
    }
    
    return queueApiCall(async () => {
      try {
        const response = await this.client.get(url, { params });
        
        // Cache successful responses
        if (useCache && ((response as any).data)) {
          const cacheKey = createCacheKey(`paginated:${url}`, params);
          queryCache.set(cacheKey, ((response as any).data), cacheTTL);
        }
        
        return ((response as any).data);
      } catch (error) {
        throw this.handleError(error);
      }
    }, { priority });
  }

  // File download method
  async downloadFile(url: string, filename?: string): Promise<void> {
    try {
      const response = await this.client.get(url, {
        responseType: 'blob',
      });

      // Create blob link to download
      const href = URL.createObjectURL(((response as any).data));
      const link = document.createElement('a');
      link.href = href;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // File upload method
  async uploadFile<T = unknown>(
    url: string, 
    file: File, 
    progressCallback?: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await this.client.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressCallback && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            progressCallback(progress);
          }
        },
      });

      return ((response as any).data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    // Use the centralized error parser
    const appError = parseError(error);
    
    // Log the error with context
    logError(appError, 'CookieApiService');
    
    // Return a standard Error object for backward compatibility
    return new Error(appError.message);
  }

  // Health check method
  async healthCheck(): Promise<HealthCheck | ApiResponse<HealthCheck>> {
    try {
      const response = await this.client.get('/health');
      return ((response as any).data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Update base URL (useful for environment switching)
  updateBaseURL(newBaseURL: string): void {
    this.baseURL = newBaseURL;
    this.client.defaults.baseURL = newBaseURL;
  }

  // Get current base URL
  getBaseURL(): string {
    return this.baseURL;
  }

  // Check if using cookie-based auth
  isUsingCookieAuth(): boolean {
    return this.isUsingCookies;
  }

  // Force cookie auth mode
  enableCookieAuth(): void {
    this.isUsingCookies = true;
    this.client.defaults.headers.common['X-Accept-Cookies'] = 'true';
    this.client.defaults.withCredentials = true;
  }

  // Force token auth mode (for migration)
  disableCookieAuth(): void {
    this.isUsingCookies = false;
    delete this.client.defaults.headers.common['X-Accept-Cookies'];
  }
}

// Create singleton instance
export const cookieApiService = new CookieApiService();
export default cookieApiService;