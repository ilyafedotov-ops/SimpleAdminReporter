/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import { 
  Typography, 
  Card, 
  Button, 
  Space, 
  Alert,
  Row,
  Col,
  Tag,
  Spin,
  Statistic,
  Progress,
  Divider,
  List,
  Badge,
  Tooltip
} from 'antd';
import { 
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  ApiOutlined,
  CloudServerOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  DashboardOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  HddOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  ClusterOutlined,
  TagOutlined
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '@/store';
import { setBreadcrumbs, setCurrentPage, selectTheme } from '@/store/slices/uiSlice';
import { healthService, OverallHealthStatus, SystemHealthMetrics, HealthCheckResult } from '@/services/healthService';

const { Title, Text } = Typography;

const HealthPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;
  
  const [systemHealth, setSystemHealth] = useState<OverallHealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'health', title: 'System Health' }));
    dispatch(setBreadcrumbs([
      { title: 'Dashboard', path: '/dashboard' },
      { title: 'System Health' }
    ]));
  }, [dispatch]);

  useEffect(() => {
    fetchHealthStatus();
    
    if (autoRefresh) {
      const interval = setInterval(fetchHealthStatus, 30000);
      setRefreshInterval(interval);
      
      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [autoRefresh]);

  const fetchHealthStatus = async () => {
    try {
      setHealthLoading(true);
      setHealthError(null);
      console.log('Fetching health status...');
      const health = await healthService.getDetailedHealth();
      console.log('Health data received:', health);
      setSystemHealth(health);
    } catch (error) {
      console.error('Failed to fetch health status:', error);
      setHealthError(error instanceof Error ? (error.message || String(error)) : 'Failed to load health data');
      setSystemHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '24px' }} />;
      case 'degraded':
        return <QuestionCircleOutlined style={{ color: '#faad14', fontSize: '24px' }} />;
      case 'unhealthy':
        return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '24px' }} />;
      default:
        return <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: '24px' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#52c41a';
      case 'degraded': return '#faad14';
      case 'unhealthy': return '#ff4d4f';
      default: return '#8c8c8c';
    }
  };

  const renderServiceCard = (
    title: string, 
    icon: React.ReactNode, 
    health: HealthCheckResult | SystemHealthMetrics | undefined,
    showResponseTime: boolean = true
  ) => (
    <Card 
      style={{
        height: '100%',
        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '16px',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      }}
      hoverable
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px', color: getStatusColor(health?.status || 'unknown') }}>
          {icon}
        </div>
        <Title level={5} style={{ margin: 0, color: darkMode ? '#f3f4f6' : '#1f2937' }}>
          {title}
        </Title>
        <div style={{ marginTop: '12px' }}>
          <Tag color={
            health?.status === 'healthy' ? 'success' : 
            health?.status === 'degraded' ? 'warning' : 
            health?.status === 'unhealthy' ? 'error' : 'default'
          }>
            {health?.status?.toUpperCase() || 'UNKNOWN'}
          </Tag>
        </div>
        {health?.responseTime && showResponseTime && (
          <div style={{ marginTop: '8px' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Response Time: {health.responseTime}ms
            </Text>
          </div>
        )}
        {health?.message && (
          <div style={{ marginTop: '8px' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {health.message}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );

  const renderSystemMetrics = () => {
    const system = systemHealth?.checks?.system;
    if (!system) return null;

    return (
      <Card 
        title={
          <Space>
            <DashboardOutlined />
            System Resources
          </Space>
        }
        style={{
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '16px'
        }}
      >
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <ThunderboltOutlined style={{ fontSize: '24px', color: '#1890ff', marginBottom: '8px' }} />
              <div>
                <Text strong>CPU Usage</Text>
              </div>
              <Progress 
                type="circle" 
                percent={Math.round(system.cpu?.usage || 0)} 
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': (system.cpu?.usage || 0) > 80 ? '#ff4d4f' : '#52c41a'
                }}
                format={percent => `${percent}%`}
              />
              <div style={{ marginTop: '8px' }}>
                <Text type="secondary">{system.cpu?.cores || 0} cores</Text>
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <HddOutlined style={{ fontSize: '24px', color: '#52c41a', marginBottom: '8px' }} />
              <div>
                <Text strong>Memory Usage</Text>
              </div>
              <Progress 
                type="circle" 
                percent={Math.round(system.memory?.percentage || 0)} 
                strokeColor={{
                  '0%': '#52c41a',
                  '100%': (system.memory?.percentage || 0) > 80 ? '#ff4d4f' : '#87d068'
                }}
                format={percent => `${percent}%`}
              />
              <div style={{ marginTop: '8px' }}>
                <Text type="secondary">
                  {system.memory?.free ? `${(system.memory.free / 1024 / 1024 / 1024).toFixed(1)}GB free` : 'N/A'}
                </Text>
              </div>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <DatabaseOutlined style={{ fontSize: '24px', color: '#fa8c16', marginBottom: '8px' }} />
              <div>
                <Text strong>Disk Usage</Text>
              </div>
              <Progress 
                type="circle" 
                percent={Math.round(system.disk?.percentage || 0)} 
                strokeColor={{
                  '0%': '#fa8c16',
                  '100%': (system.disk?.percentage || 0) > 80 ? '#ff4d4f' : '#ffa940'
                }}
                format={percent => `${percent}%`}
              />
              <div style={{ marginTop: '8px' }}>
                <Text type="secondary">
                  {system.disk?.free ? `${(system.disk.free / 1024 / 1024 / 1024).toFixed(1)}GB free` : 'N/A'}
                </Text>
              </div>
            </div>
          </Col>
        </Row>
      </Card>
    );
  };

  const renderHealthSummary = () => {
    if (!systemHealth) return null;

    const healthyCount = Object.values(systemHealth.checks || {}).filter(
      check => check?.status === 'healthy'
    ).length;
    const totalChecks = Object.keys(systemHealth.checks || {}).length;
    const healthPercentage = totalChecks > 0 ? (healthyCount / totalChecks) * 100 : 0;

    return (
      <Card 
        style={{
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '16px',
          marginBottom: '24px'
        }}
      >
        <Row align="middle" gutter={24}>
          <Col span={8} style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              {getStatusIcon(systemHealth.status)}
              <Badge 
                status={systemHealth.status === 'healthy' ? 'success' : 
                        systemHealth.status === 'degraded' ? 'warning' : 'error'} 
                style={{ position: 'absolute', top: 0, right: -8 }}
              />
            </div>
            <Title level={3} style={{ margin: '16px 0 8px 0', color: darkMode ? '#f3f4f6' : '#1f2937' }}>
              System {systemHealth.status?.toUpperCase()}
            </Title>
            <Text type="secondary">
              Last updated: {new Date(systemHealth.timestamp).toLocaleTimeString()}
            </Text>
          </Col>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <Progress 
                type="dashboard" 
                percent={Math.round(healthPercentage)} 
                strokeColor={{
                  '0%': '#ff4d4f',
                  '50%': '#faad14',
                  '100%': '#52c41a'
                }}
                format={() => (
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{healthyCount}/{totalChecks}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>Services Healthy</div>
                  </div>
                )}
              />
            </div>
          </Col>
          <Col span={8}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title="Uptime"
                  value={
                    systemHealth.uptime ? 
                      `${Math.floor(systemHealth.uptime / 3600)}h ${Math.floor((systemHealth.uptime % 3600) / 60)}m` : 
                      'Unknown'
                  }
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Version"
                  value={systemHealth.version || '1.0.0'}
                  prefix={<TagOutlined />}
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>
    );
  };

  return (
    <div style={{ 
      minHeight: 'calc(100vh - 64px)',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      padding: '32px'
    }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <HeartOutlined style={{ fontSize: '32px', color: '#4a5568' }} />
              <Title level={2} style={{ margin: 0, color: darkMode ? '#f3f4f6' : '#1f2937' }}>
                System Health Monitor
              </Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchHealthStatus}
                loading={healthLoading}
              >
                Refresh
              </Button>
              <Button
                type={autoRefresh ? 'primary' : 'default'}
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* Health Alert */}
      <Alert
        message="Real-time System Health Monitoring"
        description="Monitor the health status of all integrated services and system components. The dashboard updates automatically every 30 seconds when auto-refresh is enabled."
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: '24px' }}
      />

      {/* Loading State */}
      {healthLoading && !systemHealth && (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>
            <Text type="secondary">Loading health status...</Text>
          </div>
        </div>
      )}

      {/* Error State */}
      {healthError && !healthLoading && (
        <Alert
          message="Failed to load health status"
          description={healthError}
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: '24px' }}
          action={
            <Button size="small" onClick={fetchHealthStatus}>
              Retry
            </Button>
          }
        />
      )}

      {/* Health Content */}
      {systemHealth && (
        <>
          {/* Health Summary */}
          {renderHealthSummary()}

          {/* Core Services */}
          <Title level={4} style={{ marginBottom: '16px', color: darkMode ? '#f3f4f6' : '#1f2937' }}>
            Core Services
          </Title>
          <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
            <Col xs={24} sm={12} md={8}>
              {renderServiceCard('Database', <DatabaseOutlined />, systemHealth.checks?.database)}
            </Col>
            <Col xs={24} sm={12} md={8}>
              {renderServiceCard('Redis Cache', <ApiOutlined />, systemHealth.checks?.redis)}
            </Col>
            <Col xs={24} sm={12} md={8}>
              {renderServiceCard('Job Queue', <ClusterOutlined />, systemHealth.checks?.queue)}
            </Col>
          </Row>

          {/* External Services */}
          <Title level={4} style={{ marginBottom: '16px', color: darkMode ? '#f3f4f6' : '#1f2937' }}>
            External Services
          </Title>
          <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
            <Col xs={24} sm={12} md={8}>
              {renderServiceCard('Active Directory', <CloudServerOutlined />, systemHealth.checks?.ldap)}
            </Col>
            <Col xs={24} sm={12} md={8}>
              {renderServiceCard('Azure AD', <GlobalOutlined />, systemHealth.checks?.azure)}
            </Col>
            <Col xs={24} sm={12} md={8}>
              {renderServiceCard('Storage', <HddOutlined />, systemHealth.checks?.storage, false)}
            </Col>
          </Row>

          {/* System Metrics */}
          {renderSystemMetrics()}

          {/* Additional Details */}
          {systemHealth.checks?.storage?.details && (
            <Card 
              title="Storage Details"
              style={{ 
                marginTop: '24px',
                background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '16px'
              }}
            >
              <List
                size="small"
                dataSource={[
                  { label: 'Export Path', value: systemHealth.checks.storage.details.path },
                  { label: 'Files Count', value: systemHealth.checks.storage.details.fileCount },
                  { label: 'Total Size', value: systemHealth.checks.storage.details.totalSize }
                ]}
                renderItem={item => (
                  <List.Item>
                    <Text strong>{item.label}:</Text> <Text>{item.value}</Text>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default HealthPage;