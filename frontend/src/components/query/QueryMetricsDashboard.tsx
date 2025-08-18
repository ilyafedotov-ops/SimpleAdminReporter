import { 
  TrendingUp, TrendingDown, Minus, Activity, Zap, Clock, 
  CheckCircle, BarChart3, PieChart,
  Database, Server, HardDrive, Cpu, 
} from 'lucide-react';
import { useQueryMetrics } from '@/hooks/useQuery';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import { QueryPerformanceVisualization } from './QueryPerformanceVisualization';

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  sparklineData?: number[];
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, value, trend, subtitle, icon: Icon, color, sparklineData 
}) => {
  const darkMode = useAppSelector(selectTheme).darkMode;
  
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend > 0) return <TrendingUp size={16} color="#10b981" />;
    if (trend < 0) return <TrendingDown size={16} color="#ef4444" />;
    return <Minus size={16} color="#6b7280" />;
  };

  return (
    <div style={{
      padding: '24px',
      borderRadius: '16px',
      background: darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(20px)',
      border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        top: '-20px',
        right: '-20px',
        width: '80px',
        height: '80px',
        background: `${color}20`,
        borderRadius: '50%',
        filter: 'blur(40px)'
      }} />
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: `${color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon size={24} color={color} />
          </div>
          {trend !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {getTrendIcon()}
              <span style={{
                fontSize: '14px',
                fontWeight: '500',
                color: trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#6b7280'
              }}>
                {Math.abs(trend)}%
              </span>
            </div>
          )}
        </div>
        
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '14px',
          fontWeight: '500',
          color: darkMode ? '#9ca3af' : '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {title}
        </h3>
        
        <p style={{
          margin: 0,
          fontSize: '32px',
          fontWeight: '700',
          color: darkMode ? 'white' : '#1f2937'
        }}>
          {value}
        </p>
        
        {subtitle && (
          <p style={{
            margin: '8px 0 0 0',
            fontSize: '14px',
            color: darkMode ? '#9ca3af' : '#6b7280'
          }}>
            {subtitle}
          </p>
        )}

        {sparklineData && sparklineData.length > 0 && (
          <div style={{ marginTop: '16px', height: '40px' }}>
            <svg width="100%" height="40" viewBox={`0 0 ${sparklineData.length * 10} 40`} preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                points={sparklineData.map((v, i) => `${i * 10},${40 - (v / Math.max(...sparklineData)) * 40}`).join(' ')}
              />
              <polyline
                fill={`${color}20`}
                stroke="none"
                points={`0,40 ${sparklineData.map((v, i) => `${i * 10},${40 - (v / Math.max(...sparklineData)) * 40}`).join(' ')} ${(sparklineData.length - 1) * 10},40`}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

export const QueryMetricsDashboard: React.FC = () => {
  const { metrics, metricsLoading, health, executionHistory } = useQueryMetrics();
  const darkMode = useAppSelector(selectTheme).darkMode;

  if (metricsLoading || !metrics) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
        gap: '16px'
      }}>
        <Activity size={20} className="animate-spin" />
        <span>Loading metrics...</span>
      </div>
    );
  }

  // Calculate additional metrics
  const avgExecutionTime = metrics.avgExecutionTime || 0;
  const totalExecutions = metrics.totalExecutions || 0;
  const successfulExecutions = metrics.successfulExecutions || 0;
  const failedExecutions = metrics.failedExecutions || 0;
  const cacheHits = metrics.cacheHits || 0;
  
  const successRate = totalExecutions > 0 
    ? ((successfulExecutions / totalExecutions) * 100).toFixed(1)
    : '0';
  const cacheHitRate = totalExecutions > 0
    ? ((cacheHits / totalExecutions) * 100).toFixed(1)
    : '0';
  
  // Generate sparkline data from recent executions
  const recentExecutions = executionHistory.slice(0, 20).reverse();
  const executionTimeSparkline = recentExecutions
    .filter(e => e.endTime)
    .map(e => e.endTime! - e.startTime);
  
  // Get top queries by execution count
  const queryExecutionCounts = executionHistory.reduce((acc, exec) => {
    acc[exec.queryId] = (acc[exec.queryId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topQueries = Object.entries(queryExecutionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{
          margin: 0,
          fontSize: '28px',
          fontWeight: '700',
          color: darkMode ? 'white' : '#1f2937',
          marginBottom: '8px'
        }}>
          Query Metrics Dashboard
        </h2>
        <p style={{
          margin: 0,
          fontSize: '16px',
          color: darkMode ? '#9ca3af' : '#6b7280'
        }}>
          Real-time performance metrics and system health
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        <MetricCard
          title="Total Executions"
          value={totalExecutions.toLocaleString()}
          trend={15}
          subtitle="Last 24 hours"
          icon={Activity}
          color="#3b82f6"
        />
        
        <MetricCard
          title="Success Rate"
          value={`${successRate}%`}
          trend={successfulExecutions > failedExecutions ? 5 : -5}
          subtitle={`${successfulExecutions} successful`}
          icon={CheckCircle}
          color="#10b981"
        />
        
        <MetricCard
          title="Cache Hit Rate"
          value={`${cacheHitRate}%`}
          trend={Number(cacheHitRate) > 50 ? 10 : -10}
          subtitle={`${cacheHits} cache hits`}
          icon={Zap}
          color="#f59e0b"
        />
        
        <MetricCard
          title="Avg Execution Time"
          value={`${avgExecutionTime.toFixed(0)}ms`}
          trend={avgExecutionTime < 1000 ? 8 : -8}
          subtitle="Per query"
          icon={Clock}
          color="#8b5cf6"
          sparklineData={executionTimeSparkline}
        />
      </div>

      {/* Performance Charts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {/* Execution Status Distribution */}
        <div style={{
          padding: '24px',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
        }}>
          <h3 style={{
            margin: '0 0 24px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: darkMode ? 'white' : '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <PieChart size={20} />
            Execution Status Distribution
          </h3>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="80"
                fill="none"
                stroke={darkMode ? '#374151' : '#e5e7eb'}
                strokeWidth="20"
              />
              <circle
                cx="100"
                cy="100"
                r="80"
                fill="none"
                stroke="#10b981"
                strokeWidth="20"
                strokeDasharray={`${(successfulExecutions / totalExecutions) * 502.4} 502.4`}
                strokeDashoffset="125.6"
                transform="rotate(-90 100 100)"
              />
              <circle
                cx="100"
                cy="100"
                r="80"
                fill="none"
                stroke="#ef4444"
                strokeWidth="20"
                strokeDasharray={`${(failedExecutions / totalExecutions) * 502.4} 502.4`}
                strokeDashoffset={125.6 - (successfulExecutions / totalExecutions) * 502.4}
                transform="rotate(-90 100 100)"
              />
              <text
                x="100"
                y="100"
                textAnchor="middle"
                dominantBaseline="middle"
                fill={darkMode ? 'white' : '#1f2937'}
                fontSize="32"
                fontWeight="700"
              >
                {successRate}%
              </text>
            </svg>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#10b981' }} />
              <span style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                Successful ({successfulExecutions})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#ef4444' }} />
              <span style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                Failed ({failedExecutions})
              </span>
            </div>
          </div>
        </div>

        {/* Top Queries */}
        <div style={{
          padding: '24px',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
        }}>
          <h3 style={{
            margin: '0 0 24px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: darkMode ? 'white' : '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <BarChart3 size={20} />
            Top Queries by Execution Count
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topQueries.map(([queryId, count], index) => {
              const percentage = (count / totalExecutions) * 100;
              return (
                <div key={queryId}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '4px'
                  }}>
                    <span style={{
                      fontSize: '14px',
                      color: darkMode ? '#f3f4f6' : '#374151',
                      fontWeight: '500'
                    }}>
                      {queryId}
                    </span>
                    <span style={{
                      fontSize: '14px',
                      color: darkMode ? '#9ca3af' : '#6b7280'
                    }}>
                      {count} executions
                    </span>
                  </div>
                  <div style={{
                    height: '8px',
                    background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${percentage}%`,
                      background: `linear-gradient(135deg, ${['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'][index]}, ${['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171'][index]})`,
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* System Health */}
      {health && (
        <div style={{
          padding: '24px',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
        }}>
          <h3 style={{
            margin: '0 0 24px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: darkMode ? 'white' : '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Server size={20} />
            System Health Status
          </h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            {Object.entries(health.components).map(([component, info]) => {
              const Icon = component === 'database' ? Database :
                          component === 'cache' ? HardDrive :
                          component === 'queryEngine' ? Cpu :
                          Server;
              const color = info.status === 'healthy' ? '#10b981' :
                           info.status === 'degraded' ? '#f59e0b' : '#ef4444';
              
              return (
                <div key={component} style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(249, 250, 251, 1)',
                  border: `1px solid ${color}40`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: `${color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon size={20} color={color} />
                  </div>
                  <div>
                    <p style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: '600',
                      color: darkMode ? '#f3f4f6' : '#1f2937',
                      textTransform: 'capitalize'
                    }}>
                      {component.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                    <p style={{
                      margin: '2px 0 0 0',
                      fontSize: '12px',
                      color,
                      fontWeight: '500'
                    }}>
                      {info.status}
                      {info.latency && ` • ${info.latency}ms`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Advanced Performance Visualization */}
      <div style={{ marginTop: '32px' }}>
        <QueryPerformanceVisualization 
          metrics={{ 
            totalQueries: metrics.totalQueries || 0,
            activeQueries: metrics.activeQueries || 0,
            queuedQueries: metrics.queuedQueries || 0,
            totalExecutions: metrics.totalExecutions || 0,
            successfulExecutions: metrics.successfulExecutions || 0,
            failedExecutions: metrics.failedExecutions || 0,
            errorCount: metrics.errorCount || 0,
            cacheSize: metrics.cacheSize || 0,
            cacheHits: metrics.cacheHits || 0,
            avgExecutionTime: metrics.avgExecutionTime || 0,
            uptime: metrics.uptime || 0,
            throughput: metrics.throughput,
            executionHistory: executionHistory.map(exec => ({
              executionTime: exec.endTime ? exec.endTime - exec.startTime : 0,
              resultCount: exec.result?.result?.data?.length || 0,
              cacheHit: exec.result?.cached || false,
              timestamp: new Date(exec.startTime),
              queryId: exec.queryId
            })) 
          }} 
          className="performance-visualization" 
        />
      </div>
    </div>
  );
};