import React from 'react';
import { Badge, Tag, Tooltip, Space } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

export type ReportStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface ReportStatusBadgeProps {
  status: ReportStatus;
  showIcon?: boolean;
  showText?: boolean;
  size?: 'small' | 'default' | 'large';
  executionTime?: number; // in milliseconds
  errorMessage?: string;
}

export const ReportStatusBadge: React.FC<ReportStatusBadgeProps> = ({
  status,
  showIcon = true,
  showText = true,
  size = 'default',
  executionTime,
  errorMessage,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          color: 'default',
          icon: <ClockCircleOutlined />,
          text: 'Pending',
          description: 'Report is queued for execution',
        };
      case 'running':
        return {
          color: 'processing',
          icon: <SyncOutlined spin />,
          text: 'Running',
          description: 'Report is currently being generated',
        };
      case 'completed':
        return {
          color: 'success',
          icon: <CheckCircleOutlined />,
          text: 'Completed',
          description: executionTime
            ? `Completed in ${(executionTime / 1000).toFixed(2)}s`
            : 'Report generated successfully',
        };
      case 'failed':
        return {
          color: 'error',
          icon: <CloseCircleOutlined />,
          text: 'Failed',
          description: errorMessage || 'Report generation failed',
        };
      case 'cancelled':
        return {
          color: 'warning',
          icon: <ExclamationCircleOutlined />,
          text: 'Cancelled',
          description: 'Report generation was cancelled',
        };
      default:
        return {
          color: 'default',
          icon: null,
          text: 'Unknown',
          description: 'Unknown status',
        };
    }
  };

  const config = getStatusConfig();

  const content = (
    <Space size={4}>
      {showIcon && config.icon}
      {showText && config.text}
    </Space>
  );

  const tag = (
    <Tag
      color={config.color}
      style={{
        fontSize: size === 'large' ? '14px' : size === 'small' ? '12px' : '13px',
        padding: size === 'large' ? '4px 12px' : size === 'small' ? '2px 6px' : '3px 8px',
      }}
    >
      {content}
    </Tag>
  );

  return config.description ? (
    <Tooltip title={config.description}>{tag}</Tooltip>
  ) : (
    tag
  );
};

// Batch status indicator for multiple reports
interface BatchStatusIndicatorProps {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
}

export const BatchStatusIndicator: React.FC<BatchStatusIndicatorProps> = ({
  total,
  completed,
  failed,
  running,
  pending,
}) => {
  const getOverallStatus = (): ReportStatus => {
    if (failed > 0) return 'failed';
    if (running > 0) return 'running';
    if (pending > 0 && completed < total) return 'pending';
    if (completed === total) return 'completed';
    return 'pending';
  };

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Space>
      <Badge
        count={total}
        overflowCount={999}
        style={{ backgroundColor: '#52c41a' }}
        showZero
      />
      <ReportStatusBadge status={getOverallStatus()} />
      <Tooltip
        title={
          <div>
            <div>Total: {total}</div>
            <div>Completed: {completed}</div>
            {running > 0 && <div>Running: {running}</div>}
            {pending > 0 && <div>Pending: {pending}</div>}
            {failed > 0 && <div>Failed: {failed}</div>}
          </div>
        }
      >
        <Tag>{percentage}%</Tag>
      </Tooltip>
    </Space>
  );
};