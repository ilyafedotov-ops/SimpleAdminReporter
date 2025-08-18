import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Activity, Database, Zap } from 'lucide-react';
import { useQueryMetrics } from '@/hooks/useQuery';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';

export const QueryHealthBanner: React.FC = () => {
  const { health, healthLoading } = useQueryMetrics();
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;

  if (healthLoading || !health) return null;

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'unhealthy': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return CheckCircle;
      case 'degraded': return AlertTriangle;
      case 'unhealthy': return XCircle;
      default: return Activity;
    }
  };

  const HealthIcon = getHealthIcon(health.status);
  const healthColor = getHealthColor(health.status);

  // Only show banner if system is not healthy
  if (health.status === 'healthy') return null;

  return (
    <div style={{
      padding: '12px 32px',
      background: darkMode 
        ? `rgba(${health.status === 'degraded' ? '245, 158, 11' : '239, 68, 68'}, 0.1)`
        : `rgba(${health.status === 'degraded' ? '245, 158, 11' : '239, 68, 68'}, 0.05)`,
      borderBottom: `1px solid rgba(${health.status === 'degraded' ? '245, 158, 11' : '239, 68, 68'}, 0.3)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      zIndex: 10
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <HealthIcon size={20} color={healthColor} />
        <div>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: healthColor,
            marginBottom: '2px'
          }}>
            System Status: {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
          </div>
          <div style={{
            fontSize: '12px',
            color: darkMode ? '#d1d5db' : '#4b5563',
            display: 'flex',
            gap: '16px'
          }}>
            {Object.entries(health.components).map(([component, info]) => {
              const ComponentIcon = component === 'database' ? Database : 
                                   component === 'cache' ? Zap : 
                                   Activity;
              return (
                <span key={component} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <ComponentIcon size={12} />
                  {component}: 
                  <span style={{ 
                    color: getHealthColor(info.status),
                    fontWeight: '500'
                  }}>
                    {info.status}
                  </span>
                  {info.latency && (
                    <span style={{ opacity: 0.7 }}>
                      ({info.latency}ms)
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      
      {health.message && (
        <div style={{
          fontSize: '12px',
          color: darkMode ? '#9ca3af' : '#6b7280',
          maxWidth: '300px'
        }}>
          {health.message}
        </div>
      )}
    </div>
  );
};