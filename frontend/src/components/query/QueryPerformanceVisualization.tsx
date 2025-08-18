import React, { useMemo } from 'react';
import { Card, Space, Typography } from 'antd';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import { Clock, Zap, AlertTriangle } from 'lucide-react';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import type { QueryMetrics } from '@/types';

const { Title, Text } = Typography;

interface ExecutionHistoryItem {
  executionTime: number;
  resultCount: number;
  cacheHit: boolean;
  timestamp: string | Date;
  queryId: string;
}

interface QueryPerformanceVisualizationProps {
  metrics: QueryMetrics & { 
    executionHistory?: ExecutionHistoryItem[]; 
    queryTypeDistribution?: Record<string, number>; 
  };
  className?: string;
}

export const QueryPerformanceVisualization: React.FC<QueryPerformanceVisualizationProps> = ({
  metrics,
  className = ''
}) => {
  const darkMode = useAppSelector(selectTheme).darkMode;

  // Performance data processing
  const performanceData = useMemo(() => {
    if (!metrics.executionHistory || metrics.executionHistory.length === 0) {
      return [];
    }

    return metrics.executionHistory
      .slice(-20) // Last 20 executions
      .map((execution: ExecutionHistoryItem, index: number) => ({
        index: index + 1,
        executionTime: execution.executionTime || 0,
        resultCount: execution.resultCount || 0,
        cacheHit: execution.cacheHit || false,
        timestamp: new Date(execution.timestamp).toLocaleTimeString(),
        queryId: execution.queryId
      }));
  }, [metrics.executionHistory]);

  // Query type distribution
  const queryTypeData = useMemo(() => {
    const distribution = metrics.queryTypeDistribution || {};
    return Object.entries(distribution).map(([type, count]) => ({
      name: type,
      value: count,
      percentage: ((count / metrics.totalExecutions) * 100).toFixed(1)
    }));
  }, [metrics]);

  // Performance trends
  const performanceTrends = useMemo(() => {
    if (!performanceData.length) return [];
    
    return performanceData.map((item, index) => {
      const previous = index > 0 ? performanceData[index - 1] : item;
      const trend = item.executionTime > previous.executionTime ? 'up' : 
                   item.executionTime < previous.executionTime ? 'down' : 'stable';
      
      return {
        ...item,
        trend,
        efficiency: item.resultCount / (item.executionTime / 1000) // rows per second
      };
    });
  }, [performanceData]);

  // Color schemes
  const colors = {
    primary: darkMode ? '#3b82f6' : '#1890ff',
    success: darkMode ? '#10b981' : '#52c41a',
    warning: darkMode ? '#f59e0b' : '#faad14',
    danger: darkMode ? '#ef4444' : '#ff4d4f',
    cache: darkMode ? '#8b5cf6' : '#722ed1',
    background: darkMode ? '#1f2937' : '#ffffff',
    text: darkMode ? '#f3f4f6' : '#1f2937',
    border: darkMode ? '#374151' : '#e5e7eb'
  };

  const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  // Performance insights
  const insights = useMemo(() => {
    if (!performanceData.length) return [];

    const avgExecutionTime = performanceData.reduce((sum, item) => sum + item.executionTime, 0) / performanceData.length;
    const cacheHitRate = (performanceData.filter(item => item.cacheHit).length / performanceData.length) * 100;
    const slowQueries = performanceData.filter(item => item.executionTime > avgExecutionTime * 2).length;
    
    return [
      {
        title: 'Average Execution Time',
        value: `${avgExecutionTime.toFixed(0)}ms`,
        trend: avgExecutionTime > 2000 ? 'warning' : avgExecutionTime > 5000 ? 'danger' : 'success',
        icon: Clock
      },
      {
        title: 'Cache Hit Rate',
        value: `${cacheHitRate.toFixed(1)}%`,
        trend: cacheHitRate > 70 ? 'success' : cacheHitRate > 50 ? 'warning' : 'danger',
        icon: Zap
      },
      {
        title: 'Slow Queries',
        value: slowQueries.toString(),
        trend: slowQueries === 0 ? 'success' : slowQueries < 3 ? 'warning' : 'danger',
        icon: AlertTriangle
      }
    ];
  }, [performanceData]);

  if (!metrics || !performanceData.length) {
    return (
      <Card className={className}>
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: darkMode ? '#9ca3af' : '#6b7280'
        }}>
          <Clock size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <p>No performance data available yet.</p>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>
            Execute some queries to see performance insights.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={className}>
      {/* Performance Insights Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {insights.map((insight, index) => {
          const IconComponent = insight.icon;
          const trendColor = insight.trend === 'success' ? colors.success :
                           insight.trend === 'warning' ? colors.warning : colors.danger;
          
          return (
            <Card
              key={index}
              style={{
                background: colors.background,
                border: `1px solid ${colors.border}`,
                borderRadius: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: `${trendColor}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <IconComponent size={24} color={trendColor} />
                </div>
                <div style={{ flex: 1 }}>
                  <Text style={{ 
                    fontSize: '24px', 
                    fontWeight: 'bold',
                    color: colors.text,
                    display: 'block'
                  }}>
                    {insight.value}
                  </Text>
                  <Text style={{ 
                    fontSize: '14px',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    {insight.title}
                  </Text>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Performance Charts Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px'
      }}>
        {/* Execution Time Trend */}
        <Card
          title="Execution Time Trend"
          style={{
            background: colors.background,
            border: `1px solid ${colors.border}`
          }}
        >
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performanceTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis 
                dataKey="index" 
                stroke={colors.text}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke={colors.text}
                tick={{ fontSize: 12 }}
                label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft' }}
              />
              <RechartsTooltip 
                contentStyle={{
                  backgroundColor: colors.background,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px'
                }}
                labelFormatter={(value) => `Execution #${value}`}
                formatter={(value: number) => [`${value}ms`, 'Execution Time']}
              />
              <Line 
                type="monotone" 
                dataKey="executionTime" 
                stroke={colors.primary}
                strokeWidth={2}
                dot={{ fill: colors.primary, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: colors.primary }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Cache Performance */}
        <Card
          title="Cache vs Non-Cache Performance"
          style={{
            background: colors.background,
            border: `1px solid ${colors.border}`
          }}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis 
                dataKey="index" 
                stroke={colors.text}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke={colors.text}
                tick={{ fontSize: 12 }}
                label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft' }}
              />
              <RechartsTooltip 
                contentStyle={{
                  backgroundColor: colors.background,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px'
                }}
                formatter={(value: number, name: string) => [
                  `${value}ms`, 
                  name === 'executionTime' ? 'Execution Time' : name
                ]}
              />
              <Bar 
                dataKey="executionTime" 
                fill={colors.primary}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Query Type Distribution */}
        {queryTypeData.length > 0 && (
          <Card
            title="Query Type Distribution"
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`
            }}
          >
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={queryTypeData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percentage }) => `${name} (${percentage}%)`}
                >
                  {queryTypeData.map((_, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={pieColors[index % pieColors.length]} 
                    />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px'
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Efficiency Scatter Plot */}
        <Card
          title="Query Efficiency (Rows/Second)"
          style={{
            background: colors.background,
            border: `1px solid ${colors.border}`
          }}
        >
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={performanceTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis 
                dataKey="index" 
                stroke={colors.text}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke={colors.text}
                tick={{ fontSize: 12 }}
                label={{ value: 'Rows/Second', angle: -90, position: 'insideLeft' }}
              />
              <RechartsTooltip 
                contentStyle={{
                  backgroundColor: colors.background,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px'
                }}
                formatter={(value: number) => [`${Number(value).toFixed(2)}`, 'Efficiency']}
              />
              <Area
                type="monotone"
                dataKey="efficiency"
                stroke={colors.success}
                fill={`${colors.success}20`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Performance Recommendations */}
      <Card
        title="Performance Recommendations"
        style={{
          marginTop: '24px',
          background: colors.background,
          border: `1px solid ${colors.border}`
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {insights.map((insight, index) => {
            const recommendations = {
              'Average Execution Time': [
                'Consider adding indexes to frequently queried fields',
                'Optimize complex filters and joins',
                'Use pagination for large result sets'
              ],
              'Cache Hit Rate': [
                'Increase cache TTL for stable data',
                'Implement query result caching',
                'Use parameterized queries for better cache efficiency'
              ],
              'Slow Queries': [
                'Review and optimize slow query filters',
                'Consider breaking down complex queries',
                'Add query timeout limits'
              ]
            };

            const recs = recommendations[insight.title as keyof typeof recommendations] || [];
            
            return (
              <div key={index}>
                <Title level={5} style={{ color: colors.text, marginBottom: '8px' }}>
                  {insight.title}
                </Title>
                {recs.map((rec, recIndex) => (
                  <Text 
                    key={recIndex}
                    style={{ 
                      display: 'block',
                      color: darkMode ? '#9ca3af' : '#6b7280',
                      marginBottom: '4px',
                      paddingLeft: '16px',
                      position: 'relative'
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      left: '0',
                      color: colors.primary
                    }}>•</span>
                    {rec}
                  </Text>
                ))}
              </div>
            );
          })}
        </Space>
      </Card>
    </div>
  );
};

export default QueryPerformanceVisualization;