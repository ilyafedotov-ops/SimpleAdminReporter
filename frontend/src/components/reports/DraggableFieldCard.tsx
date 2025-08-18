import React from 'react';
import { Card, Tag, Typography, Space, Tooltip } from 'antd';
import { 
  FieldStringOutlined, 
  FieldNumberOutlined, 
  CalendarOutlined, 
  CheckCircleOutlined,
  DatabaseOutlined,
  DragOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { FieldMetadata, ReportField } from '../../types';

const { Text } = Typography;

interface DraggableFieldCardProps {
  field: FieldMetadata | ReportField;
  isDragging?: boolean;
  onRemove?: () => void;
  removable?: boolean;
  compact?: boolean;
  index?: number;
}

export const DraggableFieldCard: React.FC<DraggableFieldCardProps> = ({
  field,
  isDragging = false,
  onRemove,
  removable = false,
  compact = false,
  index,
}) => {
  const getFieldIcon = (dataType: string) => {
    switch (dataType) {
      case 'string':
        return <FieldStringOutlined style={{ color: '#1890ff' }} />;
      case 'number':
        return <FieldNumberOutlined style={{ color: '#52c41a' }} />;
      case 'boolean':
        return <CheckCircleOutlined style={{ color: '#722ed1' }} />;
      case 'datetime':
        return <CalendarOutlined style={{ color: '#fa8c16' }} />;
      case 'array':
        return <DatabaseOutlined style={{ color: '#13c2c2' }} />;
      default:
        return <FieldStringOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const getDataTypeColor = (dataType: string) => {
    switch (dataType) {
      case 'string': return 'blue';
      case 'number': return 'green';
      case 'boolean': return 'purple';
      case 'datetime': return 'orange';
      case 'array': return 'cyan';
      default: return 'default';
    }
  };

  const fieldType = 'dataType' in field ? field.dataType : field.type;
  const fieldName = 'fieldName' in field ? field.fieldName : field.name;
  const displayName = field.displayName;

  if (compact) {
    return (
      <div
        className={`draggable-field-compact ${isDragging ? 'dragging' : ''}`}
        style={{
          padding: '4px 8px',
          background: '#f0f0f0',
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'move',
          opacity: isDragging ? 0.5 : 1,
          border: '1px solid #d9d9d9',
        }}
      >
        <DragOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
        {getFieldIcon(fieldType)}
        <Text style={{ fontSize: 12 }}>{displayName}</Text>
        {removable && (
          <CloseOutlined
            style={{ fontSize: 12, cursor: 'pointer', color: '#8c8c8c' }}
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <Card
      size="small"
      className={`draggable-field-card ${isDragging ? 'dragging' : ''}`}
      style={{
        cursor: 'move',
        opacity: isDragging ? 0.5 : 1,
        marginBottom: 8,
      }}
      hoverable
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <DragOutlined style={{ color: '#8c8c8c' }} />
            {index !== undefined && (
              <Tag style={{ marginRight: 0 }}>
                #{index + 1}
              </Tag>
            )}
            {getFieldIcon(fieldType)}
            <Tooltip title={fieldName}>
              <Text strong>{displayName}</Text>
            </Tooltip>
          </Space>
          <Space>
            <Tag color={getDataTypeColor(fieldType)}>
              {fieldType}
            </Tag>
            {removable && (
              <CloseOutlined
                style={{ cursor: 'pointer', color: '#ff4d4f' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.();
                }}
              />
            )}
          </Space>
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {fieldName}
        </Text>
        {'description' in field && field.description && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {field.description}
          </Text>
        )}
      </Space>
    </Card>
  );
};

// Draggable wrapper component for react-dnd integration
interface DraggableWrapperProps {
  children: React.ReactNode;
  data: FieldMetadata | ReportField;
  type: string;
}

export const DraggableWrapper: React.FC<DraggableWrapperProps> = ({ children }) => {
  // This will be implemented with react-dnd hooks when integrating with the report builder
  return <>{children}</>;
};