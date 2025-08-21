/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Drawer, Card, Row, Col, Button, Space, Typography, Steps, Grid, Tabs, message, Input, Select, Alert, Spin, Empty, Tag } from 'antd';
import { 
  FieldTimeOutlined, 
  EyeOutlined, 
  SaveOutlined, 
  FileSearchOutlined, 
  PlayCircleOutlined, 
  ReloadOutlined, 
  UserOutlined, 
  InfoCircleOutlined 
} from '@ant-design/icons';
import { EnhancedFieldExplorer } from '../reports/EnhancedFieldExplorer';
import VisualFilterBuilder from './VisualFilterBuilder';
import { QueryVisualization } from './QueryVisualization';
import { ReportViewer } from '../reports/ReportViewer';
import { GraphEntitySelector } from '../graph/GraphEntitySelector';
import { ODataFilterBuilder, ODataFilter } from '../graph/ODataFilterBuilder';
import { GraphRelationshipExplorer } from '../graph/GraphRelationshipExplorer';
import { GraphQueryPreview } from '../graph/GraphQueryPreview';
import { MsalAzureAuthFlow } from '../auth/MsalAzureAuthFlow';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import { useFieldDiscovery } from '@/hooks/useFieldDiscovery';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { credentialsAPI } from '@/services/credentials.api';
import { QueryPreviewErrorBoundary } from './QueryPreviewErrorBoundary';
import type { DynamicQuerySpec, ServiceCredential, FieldMetadata as TypesFieldMetadata, ReportFilter } from '../../types';
import type { FieldMetadata } from '@/hooks/useFieldDiscovery';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

// Props interface for the QueryBuilderModal component
interface QueryBuilderModalProps {
  dataSource: 'ad' | 'azure' | 'o365' | 'postgres';
  onClose: () => void;
  onSave: (query: DynamicQuerySpec, name: string, description?: string) => void;
  onExecute: (query: DynamicQuerySpec, isPreview?: boolean) => Promise<any>;
  visible?: boolean;
  initialQuery?: DynamicQuerySpec | null;
  editMode?: boolean;
  reportName?: string;
  reportDescription?: string;
}

// Query builder modal component
export const QueryBuilderModal: React.FC<QueryBuilderModalProps> = ({
  dataSource,
  onClose,
  onSave,
  onExecute,
  visible = true
}) => {
  const darkMode = useAppSelector(selectTheme).darkMode;
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  
  // Enhanced error handling for preview operations
  const { handlePreviewOperation } = useErrorHandler();
  const [selectedFields, setSelectedFields] = useState<FieldMetadata[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState<string | undefined>(undefined);
  const [orderBy, setOrderBy] = useState<{ field: string; direction: 'asc' | 'desc' }[]>([]);
  const [queryName, setQueryName] = useState('');
  const [queryDescription, setQueryDescription] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [credentials, setCredentials] = useState<ServiceCredential[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<number | undefined>(undefined);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [previewResults, setPreviewResults] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number>(0);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [maxRetries] = useState(3);
  const [graphFilters, setGraphFilters] = useState<ODataFilter[]>([]);
  const [selectedRelationships, setSelectedRelationships] = useState<string[]>([]);
  const [selectedGraphEntity, setSelectedGraphEntity] = useState<string>('users');
  const [debugInfo, setDebugInfo] = useState<{
    ldapFilter?: string;
    baseDN?: string;
    attributes?: string[];
    scope?: string;
    sizeLimit?: number;
    rawQuery?: Record<string, unknown>;
    errorDetails?: { message?: string; stack?: string; response?: Record<string, unknown>; };
    // Extended diagnostic fields
    filterCount?: number;
    filterDetails?: Array<{ field: string; operator: string; value: unknown }>;
    fieldAliases?: Record<string, string[]>;
  }>({});
  
  // Get the selected credential object
  const selectedCredential = credentials.find(c => c.id === selectedCredentialId);

  // Get available fields for the selected data source using unified system
  const { 
    fields, 
    
    loading: fieldsLoading, 
    error: fieldsError,
    discoverSchema,
    isDiscovering,
    totalFields,
    setCredentialId
  } = useFieldDiscovery(dataSource);

  const loadCredentials = useCallback(async () => {
    try {
      setCredentialsLoading(true);
      const response = await credentialsAPI.getCredentials(dataSource as 'ad' | 'azure' | 'o365');
      if (response.success && ((response as any).data)) {
        const activeCredentials = ((response as any).data).filter(cred => cred.isActive);
        setCredentials(activeCredentials);
        
        // Auto-select default credential
        const defaultCred = activeCredentials.find(c => c.isDefault);
        if (defaultCred) {
          setSelectedCredentialId(defaultCred.id);
          setCredentialId?.(defaultCred.id);
        } else if (activeCredentials.length > 0) {
          setSelectedCredentialId(activeCredentials[0].id);
          setCredentialId?.(activeCredentials[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
      message.error('Failed to load service accounts');
    } finally {
      setCredentialsLoading(false);
    }
  }, [dataSource, setCredentialId]);

  // Load credentials when data source changes
  useEffect(() => {
    if (dataSource !== 'postgres' && visible) {
      loadCredentials();
    }
  }, [dataSource, visible, loadCredentials]);

  const handleCredentialChange = (credentialId: number) => {
    setSelectedCredentialId(credentialId);
    setCredentialId?.(credentialId);
    // Trigger schema refresh with new credentials
    if (dataSource === 'ad') {
      discoverSchema(true);
    }
  };

  // Handle field selection
  const handleFieldSelect = (field: FieldMetadata) => {
    if (!selectedFields.find(f => f.fieldName === field.fieldName)) {
      setSelectedFields([...selectedFields, field]);
    }
  };

  // Handle field deselection
  const handleFieldDeselect = (field: FieldMetadata) => {
    setSelectedFields(selectedFields.filter(f => f.fieldName !== field.fieldName));
  };

  // Handle filter changes
  const handleFilterChange = (newFilters: ReportFilter[]) => {
    setFilters(newFilters);
  };

  // Handle group by change
  const handleGroupByChange = (value: string) => {
    setGroupBy(value);
  };

  // Handle order by change
  const handleOrderByChange = (field: string, direction: 'asc' | 'desc') => {
    setOrderBy([{ field, direction }]);
  };

  // Helper function to find a field by name or alias
  const findFieldByNameOrAlias = useCallback((name: string): FieldMetadata | undefined => {
    const lowerName = name.toLowerCase();
    return fields.find(field => {
      // Check if it matches the field name (case-insensitive)
      if (field.fieldName.toLowerCase() === lowerName) return true;
      // Check if it matches any alias (case-insensitive)
      if (field.aliases?.some(alias => alias.toLowerCase() === lowerName)) return true;
      return false;
    });
  }, [fields]);

  // Helper function to resolve field name to actual LDAP attribute
  const resolveFieldName = useCallback((name: string): string => {
    const field = findFieldByNameOrAlias(name);
    return field ? field.fieldName : name;
  }, [findFieldByNameOrAlias]);

  // Generate the query specification
  const generateQuerySpec = useCallback((): DynamicQuerySpec => {
    if (dataSource === 'azure') {
      // For Azure Graph queries, use Graph-specific data
      return {
        dataSource: 'azure',
        select: selectedFields.map(f => f.fieldName),
        from: selectedGraphEntity,
        where: graphFilters.map(f => ({
          field: f.field,
          operator: f.operator,
          value: f.value
        })),
        limit: 1000,
        // Add Graph-specific metadata
        graphEntity: selectedGraphEntity,
        graphRelationships: selectedRelationships
      } as DynamicQuerySpec & { graphEntity?: string; graphRelationships?: string[] };
    }

    // For non-Azure queries, resolve alias names to underlying attributes
    const resolvedSelect = selectedFields.map(f => resolveFieldName(f.fieldName));

    const processedFilters = filters?.map(f => ({
      field: resolveFieldName(f.field),
      operator: f.operator,
      value: f.value,
      logic: f.logic
    })) || [];

    const baseSpec: DynamicQuerySpec = {
      dataSource,
      select: resolvedSelect,
      from: dataSource,
      where: processedFilters,
      groupBy: groupBy ? [groupBy] : undefined,
      orderBy: orderBy.length > 0 ? { ...orderBy[0], field: resolveFieldName(orderBy[0].field) } : undefined,
      limit: 1000
    };

    return baseSpec;
  }, [dataSource, selectedFields, selectedGraphEntity, graphFilters, selectedRelationships, resolveFieldName, filters, groupBy, orderBy]);
  
  // Generate the query specification with legacy fields for execution
  const generateQuerySpecWithLegacy = useCallback((): DynamicQuerySpec & Record<string, any> => {
    const baseSpec = generateQuerySpec();
    
    // Add legacy aliases for backward compatibility with AD endpoints
    return {
      ...baseSpec,
      // Legacy/alternative keys expected by some AD endpoints
      fields: selectedFields.map(f => ({
        name: resolveFieldName(f.fieldName),
        displayName: f.displayName,
        type: f.dataType,
        category: f.category
      })),
      filters: baseSpec.where,
      // Legacy field name for data source expected by older endpoints
      source: dataSource
    };
  }, [generateQuerySpec, selectedFields, resolveFieldName, dataSource]);

  // Handle save action
  const handleSave = () => {
    if (selectedFields.length === 0) {
      message.error('Please select at least one field');
      return;
    }
    if (!queryName) {
      message.error('Please enter a query name');
      return;
    }
    const querySpec = generateQuerySpec();
    onSave(querySpec, queryName, queryDescription);
    message.success('Query saved successfully!');
    onClose();
  };

  // Enhanced preview execution with comprehensive error handling and retry
  const handlePreviewExecution = useCallback(async () => {
    if (selectedFields.length === 0) {
      message.error('Please select at least one field');
      return;
    }
    if (!queryName) {
      message.error('Please enter a query name');
      return;
    }

    // Reset error state and retry count for new execution
    setPreviewError(null);
    setRetryCount(0);
    setIsRetrying(false);

    const executePreview = async (): Promise<any> => {
      const startTime = Date.now();
      const querySpec = generateQuerySpecWithLegacy();
      
      // Set debug info for AD queries
      if (dataSource === 'ad') {
        const ldapFilters = (filters ?? [])
          .map(f => {
            switch (f.operator) {
              case 'equals':
                return `(${f.field}=${f.value})`;
              case 'notEquals':
                return `(!(${f.field}=${f.value}))`;
              case 'contains':
                return `(${f.field}=*${f.value}*)`;
              case 'startsWith':
                return `(${f.field}=${f.value}*)`;
              case 'endsWith':
                return `(${f.field}=*${f.value})`;
              case 'isEmpty':
                return `(!(${f.field}=*))`;
              case 'isNotEmpty':
                return `(${f.field}=*)`;
              default:
                return '';
            }
          })
          .filter(Boolean);
        
        const ldapFilter = ldapFilters && ldapFilters.length > 0 
          ? ldapFilters.length > 1 ? `(&${ldapFilters.join('')})` : ldapFilters[0]
          : selectedFields.length > 0 ? '(&(objectClass=user))' : '(objectClass=*)';
        
        setDebugInfo({
          ldapFilter,
          filterCount: filters?.length || 0,
          filterDetails: filters?.map(f => ({
            field: f.field,
            operator: f.operator,
            value: f.value
          })) || [],
          baseDN: (selectedCredential as ServiceCredential & { baseDn?: string })?.baseDn || 'Not specified',
          attributes: selectedFields.map(f => resolveFieldName(f.fieldName)),
          fieldAliases: selectedFields.reduce((acc, field) => {
            if (field.aliases && field.aliases.length > 0) {
              acc[field.fieldName] = field.aliases;
            }
            return acc;
          }, {} as Record<string, string[]>),
          scope: 'sub',
          sizeLimit: 1000,
          rawQuery: querySpec
        });
      } else {
        setDebugInfo({
          rawQuery: querySpec
        });
      }
      
      // Execute the query
      const result = await onExecute(querySpec, true);
      setExecutionTime(Date.now() - startTime);
      
      return result;
    };

    await handlePreviewOperation(executePreview, {
      context: `${dataSource.toUpperCase()} Query Preview`,
      maxRetries,
      enableAutoRetry: true,
      onRetry: async () => {
        setIsRetrying(true);
        setRetryCount(prev => prev + 1);
      },
      onGoBack: () => {
        setCurrentStep(1); // Go back to configuration step
      },
      onSuccess: (result) => {
        setIsRetrying(false);
        
        // Handle the standardized PreviewResponse format from the new architecture
        let extractedData: Record<string, unknown>[] = [];
        
        if (result && typeof result === 'object') {
          const resultData = result as any;
          
          // Use standardized response structure from TASK-003
          if (resultData.data && Array.isArray(resultData.data)) {
            // New standardized format: { data: testData[] }
            extractedData = resultData.data;
          } else if (Array.isArray(result)) {
            // Direct array fallback
            extractedData = result;
          } else {
            // Empty results
            extractedData = [];
          }
        }
        
        setPreviewResults(extractedData);
        setCurrentStep(2); // Move to results step
        message.success(`Query executed successfully! Found ${extractedData.length} records.`);
      },
      onError: (error) => {
        setIsRetrying(false);
        setPreviewError(error.message || 'Failed to execute query');
        
        // Enhanced debug info with error details
        setDebugInfo(prev => ({
          ...prev,
          errorDetails: {
            message: error.message,
            code: error.code,
            type: error.type,
            details: error.details,
            stack: error.stack,
            canRetry: error.canRetry,
            recoveryGuidance: error.recoveryGuidance
          }
        }));
        
        // Still move to step 2 to show error details with recovery options
        setCurrentStep(2);
      },
      showNotification: false // We'll handle notifications in the onError callback
    });

    setPreviewLoading(false);
  }, [selectedFields, queryName, filters, dataSource, generateQuerySpecWithLegacy, handlePreviewOperation, onExecute, maxRetries, resolveFieldName, selectedCredential]);

  // Enhanced retry handler for preview operations
  const handleRetryPreview = useCallback(async () => {
    if (retryCount >= maxRetries) {
      message.error('Maximum retry attempts reached. Please modify your query and try again.');
      return;
    }

    setIsRetrying(true);
    await handlePreviewExecution();
  }, [retryCount, maxRetries, handlePreviewExecution]);

  // Handle final execute action (from save step) 
  const handleExecute = () => {
    if (selectedFields.length === 0) {
      message.error('Please select at least one field');
      return;
    }
    onExecute(generateQuerySpec(), false); // Pass isPreview = false for actual execution
  };


  // Get field metadata for a field name
  const getFieldMetadata = (fieldName: string): FieldMetadata | undefined => {
    return fields.find(f => f.fieldName === fieldName);
  };
  
  // Convert between type representations
  const convertFieldMetadata = (field: FieldMetadata): TypesFieldMetadata => {
    const dataType = field.dataType === 'integer' || field.dataType === 'decimal' 
      ? 'number' 
      : field.dataType === 'reference' 
      ? 'string' 
      : field.dataType as TypesFieldMetadata['dataType'];
      
    return {
      source: field.source,
      fieldName: field.fieldName,
      displayName: field.displayName,
      dataType,
      category: field.category,
      description: field.description,
      isSearchable: field.isSearchable,
      isSortable: field.isSortable,
      isExportable: field.isExportable
    };
  };
  
  // Wrapper functions for type compatibility
  const handleFieldSelectWrapper = (field: TypesFieldMetadata) => {
    const hookField = fields.find(f => f.fieldName === field.fieldName);
    if (hookField) {
      handleFieldSelect(hookField);
    }
  };
  
  const handleFieldDeselectWrapper = (field: TypesFieldMetadata) => {
    const hookField = fields.find(f => f.fieldName === field.fieldName);
    if (hookField) {
      handleFieldDeselect(hookField);
    }
  };

  // Get available fields for group by

  // Steps configuration - 3 steps with preview
  const steps = dataSource === 'azure' ? [
    {
      title: 'Build Graph Query',
      icon: <FieldTimeOutlined />,
      description: 'Select entity, fields, filters & relationships'
    },
    {
      title: 'Configure & Review',
      icon: <EyeOutlined />,
      description: 'Configure options and preview Graph query'
    },
    {
      title: 'Save Query',
      icon: <SaveOutlined />,
      description: 'Review results and save Graph query'
    }
  ] : [
    {
      title: 'Build Query',
      icon: <FieldTimeOutlined />,
      description: 'Select fields and add filters'
    },
    {
      title: 'Configure & Review',
      icon: <EyeOutlined />,
      description: 'Configure options and preview'
    },
    {
      title: 'Save Query',
      icon: <SaveOutlined />,
      description: 'Review results and save'
    }
  ];

  
  // Azure authentication flow state
  const [showAzureAuth, setShowAzureAuth] = useState(false);

  // Handle Azure authentication success
  const handleAzureAuthSuccess = () => {
    message.success('Azure AD authentication successful!');
    setShowAzureAuth(false);
    
    // Store credentials and refresh field discovery
    setTimeout(() => {
      message.info('Refreshing field discovery with new credentials...');
      discoverSchema(true);
    }, 1000);
  };

  // Handle Azure authentication error
  const handleAzureAuthError = (error: string) => {
    message.error(`Azure AD authentication failed: ${error}`);
  };

  // Render content based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        if (fieldsLoading || isDiscovering) {
          return (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Spin size="large" />
              <div style={{ marginTop: 24 }}>
                <Text strong style={{ fontSize: 16 }}>
                  {isDiscovering ? 'Discovering fields from Active Directory...' : 'Loading fields...'}
                </Text>
                {isDiscovering && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">
                      This may take a moment as we query your AD schema
                    </Text>
                  </div>
                )}
              </div>
            </div>
          );
        }
        
        if (fieldsError) {
          return (
            <div style={{ padding: '40px 20px' }}>
              <Alert
                message="Failed to load fields"
                description={fieldsError}
                type="error"
                showIcon
                action={
                  <Space>
                    <Button 
                      size="small" 
                      onClick={() => discoverSchema(true)}
                      icon={<ReloadOutlined />}
                    >
                      Retry
                    </Button>
                    {dataSource === 'azure' && (
                      <Button 
                        size="small" 
                        type="primary" 
                        onClick={() => setShowAzureAuth(true)}
                        icon={<UserOutlined />}
                      >
                        Authenticate with Azure
                      </Button>
                    )}
                  </Space>
                }
              />
              {dataSource === 'ad' && (
                <Alert
                  message="Tip: Make sure you have valid AD credentials configured"
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                  icon={<InfoCircleOutlined />}
                />
              )}
              {dataSource === 'azure' && (
                <Alert
                  message="Azure AD Authentication Required"
                  description="You need to authenticate with Azure AD to access Microsoft Graph API. Click the 'Authenticate with Azure' button above to sign in."
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                  icon={<InfoCircleOutlined />}
                />
              )}
            </div>
          );
        }
        
        if (fields.length === 0) {
          return (
            <div style={{ padding: '40px 20px' }}>
              <Empty
                description={
                  <div>
                    <Text>No fields available</Text>
                    {!selectedCredentialId && dataSource !== 'postgres' && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary">Please select a service account above</Text>
                      </div>
                    )}
                    {dataSource === 'ad' && selectedCredentialId && (
                      <div style={{ marginTop: 16 }}>
                        <Button 
                          type="primary"
                          onClick={() => discoverSchema(true)}
                          icon={<ReloadOutlined />}
                        >
                          Discover AD Schema
                        </Button>
                      </div>
                    )}
                  </div>
                }
              />
            </div>
          );
        }
        
        return (
          <div>
            {/* Azure Graph Entity Selection */}
            {dataSource === 'azure' && (
              <>
                <Alert
                  message="Microsoft Graph Query Builder"
                  description="Building queries for Azure AD using Microsoft Graph API. Select an entity type to start building your query."
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Card 
                  title="Graph Entity Selection" 
                  size="small" 
                  style={{ marginBottom: 16 }}
                >
                  <GraphEntitySelector
                    selectedEntity={selectedGraphEntity}
                    onEntityChange={(entityType, _entity) => {
                      setSelectedGraphEntity(entityType);
                      setSelectedFields([]); // Clear selected fields when entity changes
                      setFilters([]); // Clear filters when entity changes
                    }}
                    disabled={false}
                  />
                </Card>
              </>
            )}
            
            {dataSource === 'ad' && totalFields > 0 && (
              <>
                <Alert
                  message={`Found ${totalFields} fields in Active Directory`}
                  description={selectedCredential && (
                    <Space>
                      <Text type="secondary">Using credential:</Text>
                      <Text strong>{selectedCredential.credentialName}</Text>
                      {selectedCredential.username && (
                        <Text type="secondary">({selectedCredential.username})</Text>
                      )}
                    </Space>
                  )}
                  type="success"
                  showIcon
                  style={{ marginBottom: 16 }}
                  action={
                    <Button 
                      size="small" 
                      onClick={() => discoverSchema(true)}
                      icon={<ReloadOutlined />}
                    >
                      Refresh
                    </Button>
                  }
                />
                <Alert
                  message="Field Discovery"
                  description={
                    <span>
                      Fields are dynamically discovered from your Active Directory schema. Many fields have aliases - 
                      for example, you can search for <strong>sAMAccountName</strong> using <strong>username</strong>, 
                      or <strong>givenName</strong> using <strong>firstName</strong>. Check the field details to see available aliases.
                    </span>
                  }
                  type="info"
                  showIcon
                  icon={<InfoCircleOutlined />}
                  style={{ marginBottom: 16 }}
                />
              </>
            )}
            <Tabs 
              defaultActiveKey="1" 
              style={{ height: '100%' }}
              items={dataSource === 'azure' ? [
                {
                  key: '1',
                  label: 'Select Fields',
                  children: (
                    <div>
                      {selectedGraphEntity ? (
                        <div>
                          <Alert
                            message={`Selected Entity: ${selectedGraphEntity}`}
                            description="Fields will be loaded from Microsoft Graph API metadata. This may take a moment."
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                          />
                          <EnhancedFieldExplorer
                            fields={fields.map(convertFieldMetadata)}
                            selectedFields={selectedFields.map(f => f.fieldName)}
                            filters={filters}
                            onFieldSelect={handleFieldSelectWrapper}
                            onFieldDeselect={handleFieldDeselectWrapper}
                            onFiltersChange={handleFilterChange}
                            height={isMobile ? 350 : 450}
                            maxSelection={20}
                          />
                        </div>
                      ) : (
                        <Alert
                          message="Select a Graph Entity First"
                          description="Choose a Graph entity type from the entity selector above to load available fields."
                          type="warning"
                          showIcon
                        />
                      )}
                    </div>
                  )
                },
                {
                  key: '2',
                  label: `OData Filters (${graphFilters?.length || 0})`,
                  children: (
                    <ODataFilterBuilder
                      availableFields={fields.map(f => ({
                        name: f.fieldName,
                        displayName: f.displayName,
                        type: f.dataType,
                        description: f.description
                      }))}
                      filters={graphFilters.length > 0 ? graphFilters : []}
                      onChange={setGraphFilters}
                      disabled={false}
                    />
                  )
                },
                {
                  key: '3',
                  label: `Relationships (${selectedRelationships?.length || 0})`,
                  children: (
                    <GraphRelationshipExplorer
                      selectedEntity={selectedGraphEntity}
                      selectedRelationships={selectedRelationships}
                      onRelationshipChange={setSelectedRelationships}
                      onExpandRelationship={(_rel, _expand) => {
                        // Handle relationship expansion if needed
                      }}
                      disabled={false}
                    />
                  )
                }
              ] : [
                {
                  key: '1',
                  label: 'Select Fields',
                  children: (
                    <EnhancedFieldExplorer
                      fields={fields.map(convertFieldMetadata)}
                      selectedFields={selectedFields.map(f => f.fieldName)}
                      filters={filters}
                      onFieldSelect={handleFieldSelectWrapper}
                      onFieldDeselect={handleFieldDeselectWrapper}
                      onFiltersChange={handleFilterChange}
                      height={isMobile ? 350 : 450}
                      maxSelection={20}
                    />
                  )
                },
                {
                  key: '2',
                  label: `Filters (${filters?.length || 0})`,
                  children: (
                    <>
                      
                        <VisualFilterBuilder
                          fields={(selectedFields.length > 0 ? selectedFields : fields).map(convertFieldMetadata)}
                          filters={filters}
                          onChange={handleFilterChange}
                        />
                      
                      {selectedFields.length === 0 && (
                        <Alert
                          message="Tip: Select fields first"
                          description="You can add filters for any field, but it's recommended to select the fields you want to display first."
                          type="info"
                          showIcon
                          style={{ marginTop: 16 }}
                        />
                      )}
                    </>
                  )
                }
              ]}
            />
          </div>
        );
      case 1:
        return (
          <Row gutter={[24, 24]}>
            <Col span={isMobile ? 24 : 12}>
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Card title="Query Details" size="small">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text strong>
                        Query Name <Text type="danger">*</Text>
                      </Text>
                      <Input
                        value={queryName}
                        onChange={(e) => setQueryName(e.target.value)}
                        placeholder="Enter query name..."
                        size="large"
                        style={{ marginTop: 8 }}
                        status={!queryName ? 'error' : undefined}
                      />
                      {!queryName && (
                        <Text type="danger" style={{ fontSize: 12, marginTop: 4 }}>
                          Query name is required
                        </Text>
                      )}
                    </div>
                    <div>
                      <Text strong>Description (Optional)</Text>
                      <Input.TextArea
                        value={queryDescription}
                        onChange={(e) => setQueryDescription(e.target.value)}
                        placeholder="Describe what this query does..."
                        rows={3}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                  </Space>
                </Card>
                
                <Card title="Advanced Options" size="small">
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                      <Text strong>Group By (Optional)</Text>
                      <Select
                        value={groupBy}
                        onChange={handleGroupByChange}
                        placeholder="Select field to group results"
                        allowClear
                        style={{ width: '100%', marginTop: 8 }}
                        size="large"
                      >
                        {selectedFields.map(field => (
                          <Select.Option key={field.fieldName} value={field.fieldName}>
                            {field.displayName}
                          </Select.Option>
                        ))}
                      </Select>
                    </div>
                    
                    <div>
                      <Text strong>Sort By (Optional)</Text>
                      <Space.Compact style={{ width: '100%', marginTop: 8 }}>
                        <Select
                          value={orderBy[0]?.field}
                          onChange={(value) => handleOrderByChange(value, orderBy[0]?.direction || 'asc')}
                          placeholder="Select field to sort by"
                          allowClear
                          style={{ width: '70%' }}
                          size="large"
                          onClear={() => setOrderBy([])}
                        >
                          {selectedFields.map(field => (
                            <Select.Option key={field.fieldName} value={field.fieldName}>
                              {field.displayName}
                            </Select.Option>
                          ))}
                        </Select>
                        {orderBy.length > 0 && (
                          <Select
                            value={orderBy[0].direction}
                            onChange={(value) => handleOrderByChange(orderBy[0].field, value)}
                            style={{ width: '30%' }}
                            size="large"
                          >
                            <Select.Option value="asc">Ascending</Select.Option>
                            <Select.Option value="desc">Descending</Select.Option>
                          </Select>
                        )}
                      </Space.Compact>
                    </div>
                  </Space>
                </Card>
              </Space>
            </Col>
            
            <Col span={isMobile ? 24 : 12}>
              {dataSource === 'azure' ? (
                <GraphQueryPreview
                  querySpec={{
                    entityType: selectedGraphEntity,
                    selectedFields: selectedFields.map(f => f.fieldName),
                    filters: graphFilters,
                    relationships: selectedRelationships,
                    top: 100
                  }}
                  showValidation={true}
                />
              ) : (
                <QueryVisualization
                  query={{
                    fields: selectedFields.map(f => ({
                      name: f.fieldName,
                      displayName: f.displayName,
                      type: f.dataType === 'integer' || f.dataType === 'decimal' ? 'number' : 
                            f.dataType === 'reference' ? 'string' : 
                            f.dataType as 'string' | 'number' | 'boolean' | 'datetime' | 'array',
                      category: f.category
                    })),
                    filters: filters?.map(f => ({
                      field: f.field,
                      operator: f.operator as 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'isEmpty' | 'isNotEmpty',
                      value: f.value as string | number | boolean | null,
                      dataType: (() => {
                        const fieldType = getFieldMetadata(f.field)?.dataType || 'string';
                        if (fieldType === 'integer' || fieldType === 'decimal') return 'number';
                        if (fieldType === 'reference' || fieldType === 'array') return 'string';
                        return fieldType as 'string' | 'number' | 'boolean' | 'datetime';
                      })()
                    })) || [],
                    groupBy,
                    orderBy
                  }}
                  showComplexity={true}
                  showPerformanceImpact={true}
                />
              )}
            </Col>
          </Row>
        );
      case 2:
        // Results preview and save step
        return (
          <div>
            {previewError && (
              <Alert
                message="Query Execution Failed"
                description={
                  <div>
                    <div style={{ marginBottom: 8 }}>{previewError}</div>
                    {retryCount > 0 && (
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>
                        Attempted {retryCount} of {maxRetries} retries
                      </div>
                    )}
                    {debugInfo?.errorDetails?.recoveryGuidance && (
                      <div style={{ 
                        fontSize: '12px', 
                        fontStyle: 'italic',
                        marginTop: 8,
                        padding: 8,
                        background: 'rgba(0,0,0,0.05)',
                        borderRadius: 4
                      }}>
                        💡 {debugInfo.errorDetails.recoveryGuidance}
                      </div>
                    )}
                  </div>
                }
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                action={
                  <Space>
                    {debugInfo?.errorDetails?.canRetry && retryCount < maxRetries && (
                      <Button 
                        size="small" 
                        type="primary"
                        onClick={handleRetryPreview}
                        loading={isRetrying}
                        icon={<ReloadOutlined />}
                      >
                        {isRetrying ? 'Retrying...' : 'Retry'}
                      </Button>
                    )}
                    <Button size="small" onClick={() => setCurrentStep(1)}>
                      Go Back
                    </Button>
                  </Space>
                }
              />
            )}
            
            {!previewError && (
              <>
                <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
                  <Col span={isMobile ? 24 : 12}>
                    <Card title="Query Details" size="small">
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div>
                          <Text strong>
                            Query Name <Text type="danger">*</Text>
                          </Text>
                          <Input
                            value={queryName}
                            onChange={(e) => setQueryName(e.target.value)}
                            placeholder="Enter query name..."
                            size="large"
                            style={{ marginTop: 8 }}
                            status={!queryName ? 'error' : undefined}
                          />
                          {!queryName && (
                            <Text type="danger" style={{ fontSize: 12, marginTop: 4 }}>
                              Query name is required
                            </Text>
                          )}
                        </div>
                        <div>
                          <Text strong>Description (Optional)</Text>
                          <Input.TextArea
                            value={queryDescription}
                            onChange={(e) => setQueryDescription(e.target.value)}
                            placeholder="Describe what this query does..."
                            rows={2}
                            style={{ marginTop: 8 }}
                          />
                        </div>
                      </Space>
                    </Card>
                  </Col>
                  
                  <Col span={isMobile ? 24 : 12}>
                    <Card title="Execution Summary" size="small">
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text type="secondary">Records Found:</Text>
                          <Text strong>{previewResults?.length || 0}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text type="secondary">Execution Time:</Text>
                          <Text strong>{executionTime}ms</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text type="secondary">Fields Selected:</Text>
                          <Text strong>{selectedFields.length}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text type="secondary">Filters Applied:</Text>
                          <Text strong>{filters?.length || 0}</Text>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                </Row>

                <QueryPreviewErrorBoundary
                  darkMode={darkMode}
                  onRetry={handleRetryPreview}
                  onGoBack={() => setCurrentStep(1)}
                  maxRetries={maxRetries}
                  showRecoveryActions={true}
                  context="Report Results Preview"
                >
                  <ReportViewer
                    mode="preview"
                    data={{
                      results: previewResults || [],
                      resultCount: previewResults?.length || 0,
                      executionTime: executionTime,
                      reportName: queryName || 'Preview Query',
                      executedAt: new Date().toISOString(),
                      status: previewError ? 'error' : 'completed',
                      message: previewError || undefined
                    }}
                    fields={selectedFields}
                    debugInfo={debugInfo}
                    loading={previewLoading || isRetrying}
                    error={previewError}
                    onRetry={handleRetryPreview}
                    onGoBack={() => setCurrentStep(1)}
                    enableRecovery={true}
                    maxRetries={maxRetries}
                    retryCount={retryCount}
                  />
                </QueryPreviewErrorBoundary>
              </>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  if (isMobile) {
    return (
      <Drawer
        open={visible}
        onClose={onClose}
        placement="bottom"
        height="90vh"
        style={{ borderRadius: '16px 16px 0 0' }}
      >
      <div style={{ 
        minHeight: isMobile ? '85vh' : '80vh', 
        background: darkMode ? '#0f172a' : '#f8fafc'
      }}>
        {/* Header */}
        <div style={{ 
          padding: isMobile ? '16px' : '24px 32px', 
          borderBottom: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          background: darkMode ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)'
        }}>
          <div style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col flex="auto">
                <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: darkMode ? 'white' : '#1f2937' }}>
                  {dataSource === 'azure' ? 'Microsoft Graph Query Builder' : 'Visual Query Builder'}
                </Title>
                <Text type="secondary">
                  {dataSource === 'azure' 
                    ? 'Build and execute Microsoft Graph API queries with visual tools'
                    : 'Build custom queries step by step'
                  }
                </Text>
              </Col>
              {dataSource !== 'postgres' && (
                <Col>
                  <Space direction="vertical" size="small">
                    <Text style={{ fontSize: 12, color: darkMode ? '#9ca3af' : '#6b7280' }}>
                      Service Account
                    </Text>
                    <Select
                      value={selectedCredentialId}
                      onChange={handleCredentialChange}
                      loading={credentialsLoading}
                      style={{ width: 300 }}
                      placeholder="Select service account"
                      notFoundContent={
                        credentialsLoading ? <Spin size="small" /> : 
                        <Empty 
                          image={Empty.PRESENTED_IMAGE_SIMPLE} 
                          description="No credentials configured"
                        />
                      }
                      // Custom render for selected value
                      optionLabelProp="children"
                    >
                      {credentials.map(cred => (
                        <Select.Option key={cred.id} value={cred.id}>
                          <Space>
                            <UserOutlined style={{ color: darkMode ? '#60a5fa' : '#3b82f6' }} />
                            <span>{cred.credentialName}</span>
                            {cred.username && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                ({cred.username})
                              </Text>
                            )}
                            {cred.isDefault && (
                              <Tag color="blue" style={{ marginLeft: 8 }}>Default</Tag>
                            )}
                          </Space>
                        </Select.Option>
                      ))}
                    </Select>
                    {credentials.length === 0 && !credentialsLoading && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <a href="/settings/credentials">Configure credentials</a> to access fields
                      </Text>
                    )}
                  </Space>
                </Col>
              )}
            </Row>
          </div>
          
          {/* Steps indicator */}
          <Steps
            current={currentStep}
            size={isMobile ? "small" : "default"}
            items={steps}
            onChange={(step) => setCurrentStep(step)}
            style={{ marginBottom: 0 }}
          />
        </div>

        {/* Main Content */}
        <div style={{ 
          padding: isMobile ? '16px' : '24px 32px',
          flex: 1,
          overflow: 'auto'
        }}>
          {renderStepContent()}
        </div>

        {/* Footer Actions */}
        <div style={{ 
            padding: isMobile ? '16px' : '16px 32px',
            borderTop: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
            background: darkMode ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16
          }}>
          <div>
            {currentStep === 0 && (
              <Space>
                {dataSource === 'azure' ? (
                  <>
                    <Text type="secondary">
                      Entity: {selectedGraphEntity}
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {graphFilters?.length || 0} OData filter{graphFilters?.length !== 1 ? 's' : ''} applied
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {selectedRelationships?.length || 0} relationship{selectedRelationships?.length !== 1 ? 's' : ''} selected
                    </Text>
                  </>
                ) : (
                  <>
                    <Text type="secondary">
                      {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {filters?.length || 0} filter{filters?.length !== 1 ? 's' : ''} applied
                    </Text>
                  </>
                )}
              </Space>
            )}
            {currentStep === 1 && (
              <Text type="secondary">
                Configure options and execute preview
              </Text>
            )}
            {currentStep === 2 && (
              <Text type="secondary">
                {previewError ? 'Fix errors to continue' : 'Review results and save query'}
              </Text>
            )}
          </div>
          
          <Space>
            {currentStep > 0 && (
              <Button onClick={() => setCurrentStep(currentStep - 1)}>
                Previous
              </Button>
            )}
            {currentStep === 0 && (
              <Button 
                type="primary" 
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={selectedFields.length === 0}
              >
                Next
              </Button>
            )}
            {currentStep === 1 && (
              <Button 
                type="primary"
                icon={<FileSearchOutlined />}
                onClick={handlePreviewExecution}
                disabled={selectedFields.length === 0 || !queryName}
                loading={previewLoading}
              >
                Review Full Report
              </Button>
            )}
            {currentStep === 2 && !previewError && (
              <>
                <Button
                  icon={<PlayCircleOutlined />}
                  onClick={handleExecute}
                  disabled={selectedFields.length === 0}
                >
                  Execute Report
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  disabled={selectedFields.length === 0 || !queryName}
                >
                  Save Query
                </Button>
              </>
            )}
            <Button onClick={onClose}>
              Cancel
            </Button>
          </Space>
        </div>
      </div>

      {/* Azure AD Authentication Flow */}
      <MsalAzureAuthFlow
        visible={showAzureAuth}
        onClose={() => setShowAzureAuth(false)}
        onSuccess={handleAzureAuthSuccess}
        onError={handleAzureAuthError}
      />
    </Drawer>
  );
  }

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      style={{ top: 20 }}
    >
      <div style={{ 
        minHeight: isMobile ? '85vh' : '80vh', 
        background: darkMode ? '#0f172a' : '#f8fafc'
      }}>
        {/* Header */}
        <div style={{ 
          padding: isMobile ? '16px' : '24px 32px', 
          borderBottom: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
          background: darkMode ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)'
        }}>
          <div style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col flex="auto">
                <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: darkMode ? 'white' : '#1f2937' }}>
                  {dataSource === 'azure' ? 'Microsoft Graph Query Builder' : 'Visual Query Builder'}
                </Title>
                <Text type="secondary">
                  {dataSource === 'azure' 
                    ? 'Build and execute Microsoft Graph API queries with visual tools'
                    : 'Build custom queries step by step'
                  }
                </Text>
              </Col>
              {dataSource !== 'postgres' && (
                <Col>
                  <Space direction="vertical" size="small">
                    <Text style={{ fontSize: 12, color: darkMode ? '#9ca3af' : '#6b7280' }}>
                      Service Account
                    </Text>
                    <Select
                      value={selectedCredentialId}
                      onChange={handleCredentialChange}
                      loading={credentialsLoading}
                      style={{ width: 300 }}
                      placeholder="Select service account"
                      notFoundContent={
                        credentialsLoading ? <Spin size="small" /> : 
                        <Empty 
                          image={Empty.PRESENTED_IMAGE_SIMPLE} 
                          description="No credentials configured"
                        />
                      }
                      // Custom render for selected value
                      optionLabelProp="children"
                    >
                      {credentials.map(cred => (
                        <Select.Option key={cred.id} value={cred.id}>
                          <Space>
                            <UserOutlined style={{ color: darkMode ? '#60a5fa' : '#3b82f6' }} />
                            <span>{cred.credentialName}</span>
                            {cred.username && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                ({cred.username})
                              </Text>
                            )}
                            {cred.isDefault && (
                              <Tag color="blue" style={{ marginLeft: 8 }}>Default</Tag>
                            )}
                          </Space>
                        </Select.Option>
                      ))}
                    </Select>
                    {credentials.length === 0 && !credentialsLoading && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <a href="/settings/credentials">Configure credentials</a> to access fields
                      </Text>
                    )}
                  </Space>
                </Col>
              )}
            </Row>
          </div>
          
          {/* Steps indicator */}
          <Steps
            current={currentStep}
            size={isMobile ? "small" : "default"}
            items={steps}
            onChange={(step) => setCurrentStep(step)}
            style={{ marginBottom: 0 }}
          />
        </div>

        {/* Main Content */}
        <div style={{ 
          padding: isMobile ? '16px' : '24px 32px',
          flex: 1,
          overflow: 'auto'
        }}>
          {renderStepContent()}
        </div>

        {/* Footer Actions */}
        <div style={{ 
            padding: isMobile ? '16px' : '16px 32px',
            borderTop: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
            background: darkMode ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16
          }}>
          <div>
            {currentStep === 0 && (
              <Space>
                {dataSource === 'azure' ? (
                  <>
                    <Text type="secondary">
                      Entity: {selectedGraphEntity}
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {graphFilters?.length || 0} OData filter{graphFilters?.length !== 1 ? 's' : ''} applied
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {selectedRelationships?.length || 0} relationship{selectedRelationships?.length !== 1 ? 's' : ''} selected
                    </Text>
                  </>
                ) : (
                  <>
                    <Text type="secondary">
                      {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
                    </Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">
                      {filters?.length || 0} filter{filters?.length !== 1 ? 's' : ''} applied
                    </Text>
                  </>
                )}
              </Space>
            )}
            {currentStep === 1 && (
              <Text type="secondary">
                Configure options and execute preview
              </Text>
            )}
            {currentStep === 2 && (
              <Text type="secondary">
                {previewError ? 'Fix errors to continue' : 'Review results and save query'}
              </Text>
            )}
          </div>
          
          <Space>
            {currentStep > 0 && (
              <Button onClick={() => setCurrentStep(currentStep - 1)}>
                Previous
              </Button>
            )}
            {currentStep === 0 && (
              <Button 
                type="primary" 
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={selectedFields.length === 0}
              >
                Next
              </Button>
            )}
            {currentStep === 1 && (
              <Button 
                type="primary"
                icon={<FileSearchOutlined />}
                onClick={handlePreviewExecution}
                disabled={selectedFields.length === 0 || !queryName}
                loading={previewLoading}
              >
                Review Full Report
              </Button>
            )}
            {currentStep === 2 && !previewError && (
              <>
                <Button
                  icon={<PlayCircleOutlined />}
                  onClick={handleExecute}
                  disabled={selectedFields.length === 0}
                >
                  Execute Report
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  disabled={selectedFields.length === 0 || !queryName}
                >
                  Save Query
                </Button>
              </>
            )}
            <Button onClick={onClose}>
              Cancel
            </Button>
          </Space>
        </div>
      </div>

      {/* Azure AD Authentication Flow */}
      <MsalAzureAuthFlow
        visible={showAzureAuth}
        onClose={() => setShowAzureAuth(false)}
        onSuccess={handleAzureAuthSuccess}
        onError={handleAzureAuthError}
      />
    </Modal>
  );
};