/* eslint-disable @typescript-eslint/no-unused-vars */
import axios, { AxiosInstance, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiResponse, PaginatedResponse, HealthCheck } from '@/types';
import { parseError, logError } from '@/utils/errorHandler';
import { queueApiCall, ApiPriority } from '@/utils/apiQueue';
import { queryCache, createCacheKey } from '@/utils/apiCache';

// Extend AxiosRequestConfig to include our custom _retry property
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

class ApiService {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = (import.meta.env.VITE_API_URL?.trim() && import.meta.env.VITE_API_URL.trim() !== '') ? import.meta.env.VITE_API_URL.trim() : '/api';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: false,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor to add JWT auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle common errors
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const config = ((error as any)?.config) as CustomAxiosRequestConfig;
        
        // Handle authentication errors (401)
        if (error.response?.status === 401) {
          // Don't try to refresh for the refresh endpoint itself
          if (config?.url?.includes('/auth/refresh')) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(error);
          }
          
          // Try to refresh token
          const refreshToken = localStorage.getItem('refreshToken');
          if (refreshToken && !config?._retry) {
            config._retry = true; // Mark that we've tried to refresh
            try {
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
            } catch (_refreshError) {
              // Refresh failed, clear storage and redirect to login
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
              window.location.href = '/login';
            }
          } else {
            // No refresh token or already retried, redirect to login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
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
      signal?: AbortSignal;
    }
  ): Promise<ApiResponse<T>> {
    const { useCache = true, cacheTTL, priority = ApiPriority.NORMAL, immediate = false, signal } = options || {};
    
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
        const response = await this.client.get(url, { params, signal });
        
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
    options?: { priority?: number; immediate?: boolean }
  ): Promise<ApiResponse<T>> {
    const { priority = ApiPriority.NORMAL, immediate = false } = options || {};
    
    return queueApiCall(async () => {
      try {
        const response = await this.client.post(url, data);
        return ((response as any).data);
      } catch (error) {
        throw this.handleError(error);
      }
    }, { priority, immediate });
  }

  async put<T = unknown>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.put(url, data);
      return ((response as any).data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async delete<T = unknown>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.delete(url);
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
  async uploadFile<T = unknown>(url: string, file: File, progressCallback?: (progress: number) => void): Promise<ApiResponse<T>> {
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
    logError(appError, 'ApiService');
    
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
}

// Export the class for testing
export { ApiService };

// Create singleton instance
export const apiService = new ApiService();
export default apiService;