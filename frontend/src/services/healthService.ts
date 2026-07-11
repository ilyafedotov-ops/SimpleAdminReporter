/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiService } from "./api";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  status: HealthStatus;
  message: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface SystemHealthMetrics {
  status: HealthStatus;
  message: string;
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
}

export interface OverallHealthStatus {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    ldap: HealthCheckResult;
    azure: HealthCheckResult;
    queue: HealthCheckResult;
    storage: HealthCheckResult;
    system: SystemHealthMetrics;
  };
}

export interface BasicHealthResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
}

export interface ComponentHealthResponse {
  component: string;
  status: HealthStatus;
  message: string;
  responseTime?: number;
  details?: Record<string, any>;
  timestamp: string;
}

export interface HealthSummary {
  overall: HealthStatus;
  database: HealthStatus;
  redis: HealthStatus;
  ldap: HealthStatus;
  azure: HealthStatus;
  queue: HealthStatus;
  storage: HealthStatus;
  system: HealthStatus;
}

class HealthService {
  /**
   * Get basic health status (lightweight check)
   */
  async getBasicHealth(): Promise<BasicHealthResponse> {
    const response = await apiService.get<BasicHealthResponse>("/health");
    if (!response.data) {
      throw new Error("Health response was empty");
    }
    return response.data;
  }

  /**
   * Get detailed health status with all component checks
   */
  async getDetailedHealth(): Promise<OverallHealthStatus> {
    const response =
      await apiService.get<OverallHealthStatus>("/health/detailed");
    if (!response.data) {
      throw new Error("Detailed health response was empty");
    }
    return response.data;
  }

  /**
   * Get health status for a specific component
   */
  async getComponentHealth(
    component: string,
  ): Promise<ComponentHealthResponse> {
    const response = await apiService.get<ComponentHealthResponse>(
      `/health/component/${component}`,
    );
    if (!response.data) {
      throw new Error("Component health response was empty");
    }
    return response.data;
  }

  /**
   * Get health summary (component statuses only)
   */
  async getHealthSummary(): Promise<HealthSummary> {
    const response = await apiService.get<HealthSummary>("/health/summary");
    if (!response.data) {
      throw new Error("Health summary response was empty");
    }
    return response.data;
  }

  /**
   * Check if system is operational
   */
  async isOperational(): Promise<boolean> {
    try {
      const response = await apiService.get<{ operational: boolean }>(
        "/health/operational",
      );
      return response.data?.operational || false;
    } catch {
      return false;
    }
  }

  /**
   * Get readiness status (for deployment checks)
   */
  async getReadiness(): Promise<{
    status: string;
    timestamp: string;
    ready?: boolean;
  }> {
    const response = await apiService.get<{
      status: string;
      timestamp: string;
      ready?: boolean;
    }>("/health/ready");
    if (!response.data) {
      throw new Error("Readiness response was empty");
    }
    return response.data;
  }

  /**
   * Get liveness status (for health monitoring)
   */
  async getLiveness(): Promise<{
    status: string;
    timestamp: string;
    pid: number;
    uptime: number;
  }> {
    const response = await apiService.get<{
      status: string;
      timestamp: string;
      pid: number;
      uptime: number;
    }>("/health/live");
    if (!response.data) {
      throw new Error("Liveness response was empty");
    }
    return response.data;
  }
}

export const healthService = new HealthService();
