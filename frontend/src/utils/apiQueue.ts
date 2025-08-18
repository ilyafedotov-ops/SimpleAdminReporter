/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppError, ErrorType } from './errorHandler';

interface QueuedRequest<T = any> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  retries: number;
  priority: number;
  timestamp: number;
}

interface QueueConfig {
  maxConcurrent: number;
  requestDelay: number;
  retryDelay: number;
  maxRetries: number;
  priorityLevels: {
    HIGH: number;
    NORMAL: number;
    LOW: number;
  };
}

class ApiRequestQueue {
  private queue: QueuedRequest[] = [];
  private activeRequests = 0;
  private lastRequestTime = 0;
  private rateLimitedUntil = 0;
  private config: QueueConfig;

  constructor(config?: Partial<QueueConfig>) {
    this.config = {
      maxConcurrent: 2,
      requestDelay: 100, // 100ms between requests
      retryDelay: 2000, // 2 seconds base retry delay
      maxRetries: 3,
      priorityLevels: {
        HIGH: 3,
        NORMAL: 2,
        LOW: 1
      },
      ...config
    };
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    options: {
      priority?: number;
      immediate?: boolean;
    } = {}
  ): Promise<T> {
    const { priority = this.config.priorityLevels.NORMAL, immediate = false } = options;

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `${Date.now()}-${Math.random()}`,
        execute,
        resolve,
        reject,
        retries: 0,
        priority,
        timestamp: Date.now()
      };

      if (immediate && this.activeRequests < this.config.maxConcurrent && !this.isRateLimited()) {
        this.processRequest(request);
      } else {
        this.queue.push(request);
        this.queue.sort((a, b) => {
          // Sort by priority first, then by timestamp
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return a.timestamp - b.timestamp;
        });
        this.processQueue();
      }
    });
  }

  /**
   * Process the next request in the queue
   */
  private async processQueue(): Promise<void> {
    // Check if we can process more requests
    if (this.activeRequests >= this.config.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // Check if we're rate limited
    if (this.isRateLimited()) {
      const delay = this.rateLimitedUntil - Date.now();
      setTimeout(() => this.processQueue(), delay);
      return;
    }

    // Check minimum delay between requests
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.requestDelay) {
      setTimeout(() => this.processQueue(), this.config.requestDelay - timeSinceLastRequest);
      return;
    }

    // Get the next request
    const request = this.queue.shift();
    if (request) {
      this.processRequest(request);
    }
  }

  /**
   * Process a single request
   */
  private async processRequest<T>(request: QueuedRequest<T>): Promise<void> {
    this.activeRequests++;
    this.lastRequestTime = Date.now();

    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      if (this.shouldRetry(error, request)) {
        // Handle rate limit error
        if (error instanceof AppError && error.type === ErrorType.RATE_LIMIT) {
          this.handleRateLimit(error);
        }
        
        // Retry the request
        request.retries++;
        const retryDelay = this.calculateRetryDelay(request.retries);
        
        console.warn(`Request failed, retrying in ${retryDelay}ms (attempt ${request.retries}/${this.config.maxRetries})`);
        
        setTimeout(() => {
          // Re-add to queue with high priority
          this.queue.unshift({ ...request, priority: this.config.priorityLevels.HIGH });
          this.processQueue();
        }, retryDelay);
      } else {
        request.reject(error);
      }
    } finally {
      this.activeRequests--;
      // Process next request
      setTimeout(() => this.processQueue(), this.config.requestDelay);
    }
  }

  /**
   * Check if we should retry a failed request
   */
  private shouldRetry(error: unknown, request: QueuedRequest): boolean {
    if (request.retries >= this.config.maxRetries) {
      return false;
    }

    if (error instanceof AppError) {
      return [
        ErrorType.RATE_LIMIT,
        ErrorType.NETWORK,
        ErrorType.TIMEOUT,
        ErrorType.SERVER
      ].includes(error.type);
    }

    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.config.retryDelay;
    const maxDelay = 60000; // 1 minute max
    const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  /**
   * Handle rate limit error
   */
  private handleRateLimit(error: AppError): void {
    if (error.retryAfter) {
      const retryAfterMs = this.parseRetryAfter(error.retryAfter);
      if (retryAfterMs) {
        this.rateLimitedUntil = Date.now() + retryAfterMs;
        console.warn(`Rate limited until ${new Date(this.rateLimitedUntil).toLocaleTimeString()}`);
      } else {
        // Default to 5 seconds if no retry-after header
        this.rateLimitedUntil = Date.now() + 5000;
      }
    } else {
      // Default to 5 seconds if no retry-after header
      this.rateLimitedUntil = Date.now() + 5000;
    }
  }

  /**
   * Parse retry-after header
   */
  private parseRetryAfter(value: string | number): number | null {
    if (typeof value === 'number') {
      return value * 1000; // Convert seconds to milliseconds
    }

    if (typeof value === 'string') {
      const seconds = parseInt(value, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }

      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const delay = date.getTime() - Date.now();
        return delay > 0 ? delay : 0;
      }
    }

    return null;
  }

  /**
   * Check if currently rate limited
   */
  private isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      isRateLimited: this.isRateLimited(),
      rateLimitedUntil: this.rateLimitedUntil
    };
  }
}

// Create singleton instance
export const apiQueue = new ApiRequestQueue({
  maxConcurrent: 2,
  requestDelay: 200, // 200ms between requests
  retryDelay: 2000,
  maxRetries: 3
});

// Helper function to queue API calls
export function queueApiCall<T>(
  apiCall: () => Promise<T>,
  options?: { priority?: number; immediate?: boolean }
): Promise<T> {
  return apiQueue.enqueue(apiCall, options);
}

// Export priority levels
export const ApiPriority = {
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
};