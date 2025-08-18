import React, { useState, useEffect } from 'react';
import { Card, Steps, Button, Space, Typography, message, Alert, Spin } from 'antd';
import { ApiOutlined, RightOutlined, LeftOutlined, PlayCircleOutlined, SaveOutlined, LockOutlined } from '@ant-design/icons';
import { GraphEntitySelector, GraphEntity } from './GraphEntitySelector';
import { ODataFilterBuilder, ODataFilter } from './ODataFilterBuilder';
import { GraphRelationshipExplorer } from './GraphRelationshipExplorer';
import { GraphQueryPreview } from './GraphQueryPreview';
import { FieldExplorer } from '../reports/FieldExplorer';
import { MsalAzureAuthFlow } from '../auth/MsalAzureAuthFlow';
import { graphService } from '@/services/graphService';
import type { FieldMetadata } from '@/types';

const { Title, Text } = Typography;
const { Step } = Steps;

interface GraphQueryBuilderProps {
  onSave?: (queryName: string, querySpec: GraphQuerySpec) => void;
  onExecute?: (querySpec: GraphQuerySpec) => void;
  onClose?: () => void;
  initialQuery?: Partial<GraphQuerySpec>;
  disabled?: boolean;
}

interface GraphQuerySpec {
  entityType: string;
  selectedFields: string[];
  filters: ODataFilter[];
  relationships: string[];
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  top?: number;
  skip?: number;
}

export const GraphQueryBuilder: React.FC<GraphQueryBuilderProps> = ({
  onSave,
  onExecute,
  onClose,
  initialQuery,
  disabled = false
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [availableFields, setAvailableFields] = useState<FieldMetadata[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [filters, setFilters] = useState<ODataFilter[]>([]);
  const [selectedRelationships, setSelectedRelationships] = useState<string[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [isAuthRequired, setIsAuthRequired] = useState(false);
  const [showAuthFlow, setShowAuthFlow] = useState(false);

  const querySpec: GraphQuerySpec = {
    entityType: selectedEntity,
    selectedFields,
    filters,
    relationships: selectedRelationships,
    top: 100 // Default limit
  };

  useEffect(() => {
    if (initialQuery) {
      // Load initial query if provided
      setSelectedEntity(initialQuery.entityType || '');
      setSelectedFields(initialQuery.selectedFields || []);
      setFilters(initialQuery.filters || []);
      setSelectedRelationships(initialQuery.relationships || []);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (selectedEntity) {
      loadEntityFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntity]);

  const handleEntityChange = (entityType: string, _entity: GraphEntity) => {
    setSelectedEntity(entityType);
    setFilters([]);
    setSelectedRelationships([]);
    setFieldsError(null);
  };

  const loadEntityFields = async () => {
    if (!selectedEntity) return;

    console.log('Loading fields for entity:', selectedEntity);
    try {
      setFieldsLoading(true);
      setFieldsError(null);
      setIsAuthRequired(false);
      
      const response = await graphService.discoverFields(selectedEntity);
      console.log('Field discovery response:', response);
      
      if (response.success && ((response as any).data)) {
        // Transform Graph fields to FieldMetadata format
        const transformedFields: FieldMetadata[] = ((response as any).data).fields.map(field => ({
          source: 'azure' as const,
          fieldName: field.name,
          displayName: field.displayName,
          dataType: mapGraphTypeToFieldType(field.type),
          category: field.category || 'General',
          description: field.description || '',
          isSearchable: field.isSearchable !== false,
          isSortable: field.isSortable !== false,
          isExportable: field.isFilterable !== false,
          isSensitive: false
        }));
        
        setAvailableFields(transformedFields);
      } else {
        // Check if it's an authentication error
        if (response.error && (response.error.includes('authentication') || ('code' in response && response.code === 'AUTH_REQUIRED'))) {
          setIsAuthRequired(true);
          setFieldsError('Azure AD authentication required. Please authenticate to access Microsoft Graph API.');
        } else {
          throw new Error(response.error || 'Failed to load fields');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error';
      
      // Check if it's an authentication error from the network request
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 401) {
        setIsAuthRequired(true);
        setFieldsError('Azure AD authentication required. Please authenticate to access Microsoft Graph API.');
      } else {
        setFieldsError(errorMessage);
        message.error(`Failed to load fields: ${errorMessage}`);
      }
    } finally {
      setFieldsLoading(false);
    }
  };

  const mapGraphTypeToFieldType = (graphType: string): FieldMetadata['dataType'] => {
    const typeMap: Record<string, FieldMetadata['dataType']> = {
      'string': 'string',
      'boolean': 'boolean',
      'int32': 'number',
      'int64': 'number',
      'datetime': 'datetime',
      'datetimeoffset': 'datetime',
      'collection': 'array',
      'object': 'string' as const // Map reference to string for now
    };
    
    return typeMap[graphType.toLowerCase()] || 'string';
  };

  const handleFieldSelect = (field: FieldMetadata) => {
    setSelectedFields(prev => [...prev, field.fieldName]);
  };
  
  const handleFieldDeselect = (field: FieldMetadata) => {
    setSelectedFields(prev => prev.filter(f => f !== field.fieldName));
  };

  const handleAuthSuccess = () => {
    setShowAuthFlow(false);
    setIsAuthRequired(false);
    message.success('Successfully authenticated with Azure AD');
    
    // Retry loading fields
    loadEntityFields();
  };

  const handleAuthError = (error: string) => {
    setShowAuthFlow(false);
    message.error(`Authentication failed: ${error}`);
  };

  const handleNextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleExecuteQuery = () => {
    if (onExecute) {
      onExecute(querySpec);
    }
  };

  const handleSaveQuery = () => {
    if (onSave) {
      const queryName = `${selectedEntity}_query_${Date.now()}`;
      onSave(queryName, querySpec);
    }
  };

  const steps = [
    {
      title: 'Entity',
      description: 'Select Graph entity type',
      content: (
        <GraphEntitySelector
          selectedEntity={selectedEntity}
          onEntityChange={handleEntityChange}
          disabled={disabled}
        />
      )
    },
    {
      title: 'Fields',
      description: 'Choose fields to retrieve',
      content: (
        <div>
          {fieldsLoading ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Text>Loading available fields...</Text>
                </div>
              </div>
            </Card>
          ) : fieldsError ? (
            <Alert
              message={isAuthRequired ? "Authentication Required" : "Failed to load fields"}
              description={fieldsError}
              type={isAuthRequired ? "warning" : "error"}
              showIcon
              icon={isAuthRequired ? <LockOutlined /> : undefined}
              action={
                isAuthRequired ? (
                  <Space>
                    <Button type="primary" size="small" onClick={() => setShowAuthFlow(true)}>
                      Authenticate
                    </Button>
                    <Button size="small" onClick={loadEntityFields}>
                      Retry
                    </Button>
                  </Space>
                ) : (
                  <Button size="small" onClick={loadEntityFields}>
                    Retry
                  </Button>
                )
              }
            />
          ) : availableFields.length === 0 ? (
            <Alert
              message="No fields available"
              description="Please ensure you have proper permissions to access Microsoft Graph API. If you haven't authenticated yet, please click the authenticate button."
              type="info"
              showIcon
              action={
                <Button type="primary" size="small" onClick={() => setShowAuthFlow(true)}>
                  Authenticate with Azure AD
                </Button>
              }
            />
          ) : (
            <FieldExplorer
              fields={availableFields}
              selectedFields={selectedFields}
              onFieldSelect={handleFieldSelect}
              onFieldDeselect={handleFieldDeselect}
              searchable
              selectable={!disabled}
            />
          )}
        </div>
      )
    },
    {
      title: 'Filters',
      description: 'Add OData filters',
      content: (
        <ODataFilterBuilder
          availableFields={availableFields.map(f => ({
            name: f.fieldName,
            displayName: f.displayName,
            type: f.dataType,
            description: f.description
          }))}
          filters={filters}
          onChange={setFilters}
          disabled={disabled}
        />
      )
    },
    {
      title: 'Relationships',
      description: 'Explore entity relationships',
      content: (
        <GraphRelationshipExplorer
          selectedEntity={selectedEntity}
          selectedRelationships={selectedRelationships}
          onRelationshipChange={setSelectedRelationships}
          onExpandRelationship={(rel, expand) => {
            // Handle relationship expansion logic
            console.log(`${expand ? 'Expand' : 'Collapse'} relationship: ${rel}`);
          }}
          disabled={disabled}
        />
      )
    },
    {
      title: 'Preview',
      description: 'Review and execute query',
      content: (
        <GraphQueryPreview
          querySpec={querySpec}
          onExecuteQuery={handleExecuteQuery}
          disabled={disabled}
        />
      )
    }
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return selectedEntity !== '';
      case 1: return selectedFields.length > 0;
      case 2: return true; // Filters are optional
      case 3: return true; // Relationships are optional
      case 4: return true;
      default: return false;
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={3}>
          <Space>
            <ApiOutlined />
            Graph Query Builder
          </Space>
        </Title>
        <Text type="secondary">
          Build and execute Microsoft Graph API queries with visual tools
        </Text>
      </div>

      <Steps current={currentStep} style={{ marginBottom: '32px' }}>
        {steps.map((step, index) => (
          <Step
            key={index}
            title={step.title}
            description={step.description}
            status={
              index < currentStep ? 'finish' :
              index === currentStep ? 'process' :
              'wait'
            }
          />
        ))}
      </Steps>

      <Card style={{ minHeight: '500px', marginBottom: '24px' }}>
        {steps[currentStep].content}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {currentStep > 0 && (
            <Button
              icon={<LeftOutlined />}
              onClick={handlePrevStep}
              disabled={disabled}
            >
              Previous
            </Button>
          )}
        </div>

        <Space>
          <Text type="secondary">
            Step {currentStep + 1} of {steps.length}
          </Text>
        </Space>

        <div>
          <Space>
            {onClose && (
              <Button onClick={onClose} disabled={disabled}>
                Cancel
              </Button>
            )}

            {currentStep === steps.length - 1 ? (
              <Space>
                {onSave && (
                  <Button
                    icon={<SaveOutlined />}
                    onClick={handleSaveQuery}
                    disabled={disabled || !canProceed()}
                  >
                    Save Query
                  </Button>
                )}
                {onExecute && (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleExecuteQuery}
                    disabled={disabled || !canProceed()}
                  >
                    Execute Query
                  </Button>
                )}
              </Space>
            ) : (
              <Button
                type="primary"
                icon={<RightOutlined />}
                onClick={handleNextStep}
                disabled={disabled || !canProceed()}
              >
                Next
              </Button>
            )}
          </Space>
        </div>
      </div>

      {/* Azure Authentication Flow Modal */}
      <MsalAzureAuthFlow
        visible={showAuthFlow}
        onClose={() => setShowAuthFlow(false)}
        onSuccess={handleAuthSuccess}
        onError={handleAuthError}
      />
    </div>
  );
};

export default GraphQueryBuilder;