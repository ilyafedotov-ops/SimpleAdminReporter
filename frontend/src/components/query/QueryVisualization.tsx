/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Card, Typography, Space, Divider, Tag, Tooltip } from 'antd';
import { 
  DatabaseOutlined, 
  UnorderedListOutlined, 
  FilterOutlined, 
  GroupOutlined, 
  SortAscendingOutlined,
  RightOutlined
} from '@ant-design/icons';
import { CustomReportQuery } from '../../types';
import { QueryComplexityAnalyzer, QueryComplexity } from '../../utils/QueryComplexityAnalyzer';

const { Title, Text } = Typography;

// Props interface for the QueryVisualization component
interface QueryVisualizationProps {
  query: CustomReportQuery;
  showComplexity?: boolean;
  showPerformanceImpact?: boolean;
  onQueryClick?: () => void;
  className?: string;
}

// Query visualization component
export const QueryVisualization: React.FC<QueryVisualizationProps> = ({
  query,
  showComplexity = true,
  showPerformanceImpact = true,
  onQueryClick,
  className = ''
}) => {
  // Create analyzer instance
  const analyzer = new QueryComplexityAnalyzer();
  const complexity: QueryComplexity = analyzer.analyze(query);

  // Determine if the component is clickable
  const isClickable = !!onQueryClick;

  // Base styles
  const baseStyles = {
    cursor: isClickable ? 'pointer' : 'default'
  };

  return (
    <Card 
      className={className}
      style={baseStyles}
      hoverable={isClickable}
      onClick={onQueryClick}
      title={
        <Space>
          <DatabaseOutlined />
          <Text strong>Query Visualization</Text>
        </Space>
      }
      extra={
        showComplexity && (
          <Tooltip title={`Complexity: ${complexity.level.toUpperCase()}`}>
            <Tag color={analyzer.getComplexityColor(complexity.level)}>
              {analyzer.getComplexityIcon(complexity.level)} {complexity.level}
            </Tag>
          </Tooltip>
        )
      }
    >
      {/* Data Source Section */}
      <div className="query-section">
        <Title level={5} style={{ marginBottom: 8 }}>
          <Space>
            <DatabaseOutlined style={{ color: '#1890ff' }} />
            <Text strong>Data Source</Text>
          </Space>
        </Title>
        <Text type="secondary" style={{ marginLeft: 24 }}>
          {query.fields.length > 0 ? 'Active Directory / Azure AD / Office 365' : 'Select a data source'}
        </Text>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Fields Section */}
      <div className="query-section">
        <Title level={5} style={{ marginBottom: 8 }}>
          <Space>
            <UnorderedListOutlined style={{ color: '#52c41a' }} />
            <Text strong>Selected Fields</Text>
            <Tag>{query.fields.length}</Tag>
          </Space>
        </Title>
        {query.fields.length === 0 ? (
          <Text type="secondary" style={{ marginLeft: 24 }}>
            No fields selected
          </Text>
        ) : (
          <div style={{ marginLeft: 24 }}>
            {query.fields.map((field, index) => (
              <div key={index} style={{ marginBottom: 4 }}>
                <Text code>{field.displayName}</Text>
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  {field.type}
                </Tag>
              </div>
            ))}
          </div>
        )}
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* Filters Section */}
      <div className="query-section">
        <Title level={5} style={{ marginBottom: 8 }}>
          <Space>
            <FilterOutlined style={{ color: '#fa8c16' }} />
            <Text strong>Filters</Text>
            <Tag>{query.filters.length}</Tag>
          </Space>
        </Title>
        {query.filters.length === 0 ? (
          <Text type="secondary" style={{ marginLeft: 24 }}>
            No filters applied
          </Text>
        ) : (
          <div style={{ marginLeft: 24 }}>
            {query.filters.map((filter, index) => (
              <div key={index} style={{ marginBottom: 4 }}>
                <Text strong>{filter.field}</Text>
                <Text style={{ margin: '0 8px' }}>
                  {getOperatorLabel(filter.operator)}
                </Text>
                <Text code>{formatValue(filter.value, filter.dataType)}</Text>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Group By Section */}
      {query.groupBy && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div className="query-section">
            <Title level={5} style={{ marginBottom: 8 }}>
              <Space>
                <GroupOutlined style={{ color: '#722ed1' }} />
                <Text strong>Group By</Text>
              </Space>
            </Title>
            <div style={{ marginLeft: 24 }}>
              <Text code>{query.groupBy}</Text>
            </div>
          </div>
        </>
      )}

      {/* Order By Section */}
      {query.orderBy && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div className="query-section">
            <Title level={5} style={{ marginBottom: 8 }}>
              <Space>
                <SortAscendingOutlined style={{ color: '#13c2c2' }} />
                <Text strong>Sort By</Text>
              </Space>
            </Title>
            <div style={{ marginLeft: 24 }}>
              <Text code>{query.orderBy?.[0]?.field}</Text>
              <Tag color="orange" style={{ marginLeft: 8 }}>
                {query.orderBy?.[0]?.direction}
              </Tag>
            </div>
          </div>
        </>
      )}

      {/* Complexity and Performance Section */}
      {(showComplexity || showPerformanceImpact) && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div className="query-section">
            <Title level={5} style={{ marginBottom: 8 }}>
              <Space>
                <RightOutlined style={{ color: '#8c8c8c' }} />
                <Text strong>Query Analysis</Text>
              </Space>
            </Title>
            <div style={{ marginLeft: 24 }}>
              {showComplexity && (
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Complexity: </Text>
                  <Tag color={analyzer.getComplexityColor(complexity.level)}>
                    {analyzer.getComplexityIcon(complexity.level)} {complexity.level}
                  </Tag>
                  <Text style={{ marginLeft: 8 }}>
                    Score: {complexity.score}
                  </Text>
                </div>
              )}
              
              {showPerformanceImpact && (
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Performance Impact: </Text>
                  <Tag color={
                    complexity.performanceImpact === 'low' ? 'green' :
                    complexity.performanceImpact === 'medium' ? 'orange' : 'red'
                  }>
                    {complexity.performanceImpact}
                  </Tag>
                </div>
              )}
              
              {complexity.suggestions.length > 0 && (
                <div>
                  <Text strong>Suggestions: </Text>
                  <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                    {complexity.suggestions.map((suggestion, index) => (
                      <li key={index} style={{ marginBottom: 4 }}>
                        <Text type="secondary">{suggestion}</Text>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

// Helper function to get operator label
function getOperatorLabel(operator: string): string {
  const operatorMap: Record<string, string> = {
    equals: '=',
    notEquals: '≠',
    contains: 'contains',
    notContains: 'not contains',
    startsWith: 'starts with',
    endsWith: 'ends with',
    greaterThan: '>',
    lessThan: '<',
    greaterThanOrEqual: '≥',
    lessThanOrEqual: '≤',
    isEmpty: 'is empty',
    isNotEmpty: 'is not empty',
  };
  return operatorMap[operator] || operator;
}

// Helper function to format value for display
function formatValue(value: any, dataType: string): string {
  if (value === null || value === undefined) return 'null';
  if (dataType === 'boolean') return value ? 'true' : 'false';
  if (dataType === 'datetime' && typeof value === 'string') {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

// Flow diagram visualization component
interface QueryFlowDiagramProps {
  query: CustomReportQuery;
  width?: number;
  height?: number;
}

export const QueryFlowDiagram: React.FC<QueryFlowDiagramProps> = ({ 
  query, 
  width = 600, 
  height = 200 
}) => {
  // Calculate positions for nodes
  const nodeWidth = 120;
  const nodeHeight = 60;
  const nodePadding = 20;
  const startX = 50;
  const startY = 50;
  const levelHeight = 80;

  // Determine which nodes to show based on query content
  const nodes = [
    { id: 'source', label: 'Data Source', x: startX, y: startY },
    { id: 'fields', label: 'Fields', x: startX, y: startY + levelHeight },
    { id: 'filters', label: 'Filters', x: startX, y: startY + levelHeight * 2 }
  ];

  // Add group by node if present
  if (query.groupBy) {
    nodes.push({ 
      id: 'group', 
      label: 'Group By', 
      x: startX + nodeWidth + nodePadding, 
      y: startY + levelHeight * 2 
    });
  }

  // Add order by node if present
  if (query.orderBy) {
    nodes.push({ 
      id: 'order', 
      label: 'Sort', 
      x: startX + nodeWidth + nodePadding, 
      y: startY + levelHeight * 3 
    });
  }

  // Create connections between nodes
  const connections = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    if (i === 0 || (i === 2 && !query.groupBy)) {
      // Connect to next node
      connections.push({
        from: nodes[i].id,
        to: nodes[i + 1].id
      });
    } else if (i === 1 && query.groupBy) {
      // Connect fields to both filters and group by
      connections.push({
        from: nodes[i].id,
        to: nodes[i + 1].id
      });
      connections.push({
        from: nodes[i].id,
        to: nodes[i + 2].id
      });
    }
  }

  return (
    <div style={{ position: 'relative', width, height, border: '1px solid #d9d9d9', borderRadius: 8, overflow: 'hidden' }}>
      <svg width="100%" height="100%">
        {/* Connections */}
        {connections.map((conn, index) => {
          const fromNode = nodes.find(n => n.id === conn.from);
          const toNode = nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          const fromX = fromNode.x + nodeWidth;
          const fromY = fromNode.y + nodeHeight / 2;
          const toX = toNode.x;
          const toY = toNode.y + nodeHeight / 2;

          return (
            <line
              key={index}
              x1={fromX}
              y1={fromY}
              x2={toX}
              y2={toY}
              stroke="#1890ff"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          );
        })}

        {/* Arrowhead definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#1890ff" />
          </marker>
        </defs>

        {/* Nodes */}
        {nodes.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={nodeWidth}
              height={nodeHeight}
              fill="#ffffff"
              stroke="#1890ff"
              strokeWidth="2"
              rx="8"
              ry="8"
            />
            <text
              x={node.x + nodeWidth / 2}
              y={node.y + nodeHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#1890ff"
              fontSize="14"
              fontWeight="bold"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};