import React, { useEffect, useState, useCallback } from 'react';
import { Alert, Spin } from 'antd';
import { WifiOff, RefreshCw } from 'lucide-react';
import { apiService } from '@/services/api';
import { HealthCheck, ApiResponse } from '@/types';

interface BackendStatusProps {
  onReady?: () => void;
}

export const BackendStatus: React.FC<BackendStatusProps> = ({ onReady }) => {
  const [checking, setChecking] = useState(true);
  const [backendReady, setBackendReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkBackendStatus = useCallback(async () => {
    try {
      setChecking(true);
      setError(null);
      
      const response = await apiService.healthCheck();
      
      // Check if response is a direct HealthCheck object or wrapped in ApiResponse
      const isHealthy = 'status' in response 
        ? response.status === 'healthy'
        : (response as ApiResponse<HealthCheck>).success || (response as ApiResponse<HealthCheck>).data?.status === 'healthy';
      
      if (isHealthy) {
        setBackendReady(true);
        onReady?.();
      } else {
        throw new Error('Backend not ready');
      }
    } catch {
      setError('Backend service is not available. Please ensure the backend is running.');
      setBackendReady(false);
      
      // Auto-retry with exponential backoff
      if (retryCount < 5) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          checkBackendStatus();
        }, delay);
      }
    } finally {
      setChecking(false);
    }
  }, [retryCount, onReady]);

  useEffect(() => {
    checkBackendStatus();
  }, [checkBackendStatus]);

  if (backendReady) {
    return null;
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '200px',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {checking ? (
        <>
          <Spin size="large" />
          <div>Connecting to backend service...</div>
        </>
      ) : error ? (
        <Alert
          message="Backend Connection Error"
          description={
            <div>
              <p>{error}</p>
              <p>Please check:</p>
              <ul>
                <li>Backend service is running (npm run dev)</li>
                <li>Backend is accessible on port 5000</li>
                <li>Database and Redis containers are running</li>
              </ul>
            </div>
          }
          type="error"
          icon={<WifiOff />}
          action={
            <button
              onClick={() => {
                setRetryCount(0);
                checkBackendStatus();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              Retry
            </button>
          }
          showIcon
        />
      ) : null}
    </div>
  );
};