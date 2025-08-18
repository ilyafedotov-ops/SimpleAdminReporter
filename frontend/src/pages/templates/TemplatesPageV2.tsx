/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-loss-of-precision */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Clock,
  UserCheck,
  Cloud,
  Mail,
  FileText,
  Play,
  Plus,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Sparkles,
  Zap,
  Star,
  BarChart3,
  Grid3X3,
  List,
  FileBarChart,
  FolderOpen,
  Users,
  History,
  Database,
  Layers,
  CheckCircle,
  SortAsc,
  SortDesc,
  Shield,
  Activity,
  Edit,
  Share2,
  X
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store';
import { setBreadcrumbs, setCurrentPage, selectTheme } from '@/store/slices/uiSlice';
import { ReportExecutionModal } from '@/components/reports/ReportExecutionModal';
import { reportsService } from '@/services/reportsService';
import apiService from '@/services/api';
import type { QueryDefinition, QueryExecutionResult } from '@/types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { EnhancedDataTable, defaultFormatCellValue, hasInformation } from '@/components/common';
import { message, Modal } from 'antd';
import { Trash2 } from 'lucide-react';

dayjs.extend(relativeTime);

// Subcategory definitions
const SUBCATEGORIES = {
  ad: [
    { id: 'users', name: 'Users', icon: Users, description: 'User account reports' },
    { id: 'groups', name: 'Groups', icon: FolderOpen, description: 'Group management reports' },
    { id: 'security', name: 'Security', icon: Shield, description: 'Security and compliance' },
    { id: 'computers', name: 'Computers', icon: Database, description: 'Computer and server reports' }
  ],
  azure: [
    { id: 'users', name: 'Users', icon: Users, description: 'Azure AD user reports' },
    { id: 'security', name: 'Security', icon: Shield, description: 'Security and risk reports' },
    { id: 'apps', name: 'Applications', icon: Grid3X3, description: 'App registrations and usage' },
    { id: 'computers', name: 'Computers', icon: Database, description: 'Device management reports' }
  ],
  o365: [
    { id: 'users', name: 'Users', icon: Users, description: 'User account reports' },
    { id: 'apps', name: 'Applications', icon: Grid3X3, description: 'Email and mailbox reports' },
    { id: 'usage', name: 'Usage', icon: BarChart3, description: 'Service usage analytics' },
    { id: 'security', name: 'Security', icon: Shield, description: 'Security and compliance' }
  ]
};

const TemplatesPageV2: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useAppSelector(selectTheme);
  
  // State
  const [definitions, setDefinitions] = useState<QueryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'system' | 'custom' | 'results'>('system');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'popular' | 'recent'>('popular');
  const [showFilters, setShowFilters] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<QueryDefinition | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [parameterModalOpen, setParameterModalOpen] = useState(false);
  const [favoriteTemplates, setFavoriteTemplates] = useState<Set<string>>(new Set());
  const [recentTemplates, setRecentTemplates] = useState<string[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<Record<string, unknown> | null>(null);
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Force re-render on delete
  // These state variables are no longer needed with EnhancedDataTable
  // const [resultsFilter, setResultsFilter] = useState('');
  // const [resultsSortField, setResultsSortField] = useState<string | null>(null);
  // const [resultsSortDirection, setResultsSortDirection] = useState<'asc' | 'desc'>('asc');
  // const [resultsPage, setResultsPage] = useState(1);
  // const resultsPageSize = 50;

  // Fetch templates
  const fetchTemplates = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      // Add timestamp to force fresh data when needed
      const params = forceRefresh ? { 
        pageSize: 100, 
        _t: Date.now() // Cache buster
      } : { 
        pageSize: 100 
      };
      
      // Fetch both built-in templates and custom templates
      const [templatesResponse, customResponse] = await Promise.all([
        reportsService.getReportTemplates(forceRefresh ? { _t: Date.now() } : undefined),
        reportsService.getCustomReports(params)
      ]);

      const allDefinitions: QueryDefinition[] = [];

      // Process built-in templates
      if (templatesResponse.success && templatesResponse.data) {
        const builtInTemplates = (templatesResponse.data.definitions || []).map((def: QueryDefinition) => ({
          ...def,
          isCustom: false
          // Backend already provides: executionCount, avgExecutionTime, category, subcategory
          // Additional fields can be added based on actual execution history
        }));
        allDefinitions.push(...builtInTemplates);
      }

      // Process custom templates
      if (customResponse.success && customResponse.data) {
        // Extract reports array from the response
        const customReports = customResponse.data.reports || [];
        const customTemplates = customReports.map((custom: any) => ({
          id: custom.id,
          name: custom.name,
          description: custom.description,
          dataSource: custom.source,
          isCustom: true,
          category: custom.category || 'custom',
          subcategory: 'custom',
          executionCount: custom.executionCount || 0,
          lastExecuted: custom.lastExecuted,
          avgExecutionTime: custom.avgExecutionTime || 0,
          tags: custom.tags || ['custom'],
          createdAt: custom.createdAt,
          updatedAt: custom.updatedAt
        } as QueryDefinition));
        allDefinitions.push(...customTemplates);
      }

      setDefinitions(allDefinitions);
      
      if (allDefinitions.length === 0) {
        setError('No templates found');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load templates';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch recent results
  const fetchRecentResults = useCallback(async () => {
    try {
      const response = await reportsService.getReportHistory({ 
        page: 1, 
        pageSize: 20,
        sortBy: 'executed_at',
        sortOrder: 'desc'
      });
      if (response.success && ((response as any).data)) {
        setRecentResults(((response as any).data).executions || []);
      }
    } catch (error) {
      console.error('Failed to fetch recent results:', error);
    }
  }, []);

  // Fetch report result data
  const fetchResultData = useCallback(async (executionId: string) => {
    setLoadingResult(true);
    try {
      const response = await reportsService.getReportResults(executionId);
      if (response.success && ((response as any).data)) {
        setResultData(((response as any).data));
      } else {
        console.error('Failed to fetch result data');
      }
    } catch (error) {
      console.error('Error fetching result data:', error);
    } finally {
      setLoadingResult(false);
    }
  }, []);

  // Handle result selection
  const handleResultSelect = useCallback((result: any) => {
    setSelectedResult(result);
    if (result.id) {
      fetchResultData(result.id);
    }
  }, [fetchResultData]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    // If results tab is selected, return empty array as we'll show results instead
    if (selectedTab === 'results') {
      return [];
    }

    let filtered = definitions;

    // Tab filter (system vs custom)
    if (selectedTab === 'system') {
      filtered = filtered.filter(def => !def.isCustom);
    } else if (selectedTab === 'custom') {
      filtered = filtered.filter(def => def.isCustom);
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(def => def.dataSource === selectedCategory);
    }

    // Subcategory filter
    if (selectedSubcategory !== 'all') {
      filtered = filtered.filter(def => def.subcategory === selectedSubcategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(def => 
        def.name.toLowerCase().includes(query) ||
        def.description?.toLowerCase().includes(query) ||
        def.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Sort
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'popular':
        filtered.sort((a, b) => (b.executionCount || 0) - (a.executionCount || 0));
        break;
      case 'recent':
        filtered.sort((a, b) => {
          const aDate = a.lastExecuted ? new Date(a.lastExecuted).getTime() : 0;
          const bDate = b.lastExecuted ? new Date(b.lastExecuted).getTime() : 0;
          return bDate - aDate;
        });
        break;
    }

    return filtered;
  }, [definitions, selectedTab, selectedCategory, selectedSubcategory, searchQuery, sortBy]);

  // Get available subcategories
  const availableSubcategories = useMemo(() => {
    if (selectedCategory === 'all') return [];
    return SUBCATEGORIES[selectedCategory as keyof typeof SUBCATEGORIES] || [];
  }, [selectedCategory]);

  // Stats
  const stats = useMemo(() => {
    if (selectedTab === 'results') {
      return {
        total: recentResults.length,
        totalRuns: recentResults.length,
        avgTime: recentResults.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0) / (recentResults.length || 1),
        categories: {
          ad: recentResults.filter(r => r.source === 'ad').length,
          azure: recentResults.filter(r => r.source === 'azure').length,
          o365: recentResults.filter(r => r.source === 'o365').length
        }
      };
    }

    const templates = selectedTab === 'system' ? 
      definitions.filter(d => !d.isCustom) : 
      definitions.filter(d => d.isCustom);
    
    return {
      total: templates.length,
      totalRuns: templates.reduce((sum, t) => sum + (t.executionCount || 0), 0),
      avgTime: templates.reduce((sum, t) => sum + (t.avgExecutionTime || 0), 0) / (templates.length || 1),
      categories: {
        ad: templates.filter(t => t.dataSource === 'ad').length,
        azure: templates.filter(t => t.dataSource === 'azure').length,
        o365: templates.filter(t => t.dataSource === 'o365').length
      }
    };
  }, [definitions, selectedTab, recentResults]);

  // Execute report
  const handleExecuteReport = async (
    queryId: string,
    parameters: Record<string, unknown>,
    options: { credentialId?: number; format?: string } = {}
  ): Promise<QueryExecutionResult> => {
    try {
      // Find the template to check if it's custom
      const template = definitions.find(d => d.id === queryId);
      
      if (template?.isCustom) {
        // For custom reports, use the executeCustomReport endpoint
        const result = await reportsService.executeCustomReport(
          queryId,
          parameters,
          options.credentialId
        );
        
        if (!result.success || !((result as any)?.data)) {
          throw new Error(result.error || 'Custom report execution failed');
        }
        
        // Add to recent templates
        setRecentTemplates(prev => [queryId, ...prev.filter(id => id !== queryId)].slice(0, 5));
        
        // Transform the result to match expected format
        return {
          queryId,
          executionId: ((result as any)?.data).executionId,
          executedAt: ((result as any)?.data).executedAt,
          result: {
            data: ((result as any)?.data).data || [],
            metadata: {
              rowCount: ((result as any)?.data).totalCount || ((result as any)?.data).rowCount || 0,
              executionTime: ((result as any)?.data).executionTimeMs || ((result as any)?.data).executionTime || 0,
              cachedResult: false,
              dataSource: ((result as any)?.data).source
            }
          },
          cached: false
        };
      } else {
        // For built-in templates, use the regular execute endpoint
        const result = await reportsService.executeReport(
          queryId, 
          parameters, 
          options.credentialId
        );
        
        if (!result.success || !((result as any)?.data)) {
          throw new Error(result.error || 'Report execution failed');
        }
        
        // Add to recent templates
        setRecentTemplates(prev => [queryId, ...prev.filter(id => id !== queryId)].slice(0, 5));
        
        // Return the properly structured result that matches the expected format
        return ((result as any)?.data) || result;
      }
    } catch (error) {
      console.error('Report execution error:', error);
      throw error;
    }
  };

  // Toggle favorite
  const toggleFavorite = async (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    
    try {
      const isFavorite = favoriteTemplates.has(templateId);
      
      // Optimistically update UI
      setFavoriteTemplates(prev => {
        const newFavorites = new Set(prev);
        if (isFavorite) {
          newFavorites.delete(templateId);
        } else {
          newFavorites.add(templateId);
        }
        return newFavorites;
      });
      
      // Call API to persist the change
      if (isFavorite) {
        await reportsService.removeFromFavorites(templateId, false);
      } else {
        await reportsService.addToFavorites(templateId, false);
      }
    } catch (error) {
      console.error('Failed to update favorite status:', error);
      
      // Revert the optimistic update on error
      setFavoriteTemplates(prev => {
        const newFavorites = new Set(prev);
        if (favoriteTemplates.has(templateId)) {
          newFavorites.add(templateId);
        } else {
          newFavorites.delete(templateId);
        }
        return newFavorites;
      });
      
      message.error('Failed to update favorite status');
    }
  };

  // Handle template click
  const handleTemplateClick = (template: QueryDefinition) => {
    setSelectedTemplate(template);
    setShowDetails(true);
  };

  // Handle run template
  const handleRunTemplate = (template: QueryDefinition) => {
    setSelectedTemplate(template);
    setParameterModalOpen(true);
  };

  // Handle edit template
  const handleEditTemplate = (template: QueryDefinition) => {
    if (template.isCustom) {
      navigate(`/reports/builder/${template.id}`);
    } else {
      message.warning('System templates cannot be edited');
    }
  };

  // Handle delete template
  const handleDeleteTemplate = async (template: QueryDefinition) => {
    if (!template.isCustom) {
      message.warning('System templates cannot be deleted');
      return;
    }

    Modal.confirm({
      title: 'Delete Template',
      content: `Are you sure you want to delete "${template.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await reportsService.deleteCustomReport(template.id);
          if (response.success) {
            message.success('Template deleted successfully');
            
            // Close details panel if we were viewing the deleted template
            if (selectedTemplate?.id === template.id) {
              setSelectedTemplate(null);
              setShowDetails(false);
            }
            
            // Clear the definitions first to force UI update
            setDefinitions([]);
            
            // Also clear from favorites if it was favorited
            setFavoriteTemplates(prev => {
              const newFavorites = new Set(prev);
              newFavorites.delete(template.id);
              return newFavorites;
            });
            
            // Fetch fresh data from server with force refresh
            await fetchTemplates(true);
          } else {
            message.error(response.error || 'Failed to delete template');
          }
        } catch (error) {
          console.error('Error deleting template:', error);
          message.error('Failed to delete template');
        }
      }
    });
  };

  // Get icon for data source
  const getIconForDataSource = (dataSource: string) => {
    switch (dataSource?.toLowerCase()) {
      case 'ad': return UserCheck;
      case 'azure': return Cloud;
      case 'o365': return Mail;
      default: return FileText;
    }
  };

  // Get color for data source
  const getColorForDataSource = (dataSource: string) => {
    switch (dataSource?.toLowerCase()) {
      case 'ad': return 'from-blue-400 to-blue-600';
      case 'azure': return 'from-cyan-400 to-cyan-600';
      case 'o365': return 'from-gray-400 to-gray-600';
      default: return 'from-gray-400 to-gray-600';
    }
  };

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'templates', title: 'Report Templates' }));
    dispatch(setBreadcrumbs([{ title: 'Report Templates' }]));
    
    // Check if we need to refresh due to navigation from report builder
    const navigationState = location.state as { refresh?: boolean; tab?: string } | null;
    if (navigationState?.refresh) {
      fetchTemplates(true); // Force refresh
      // Switch to custom tab if specified
      if (navigationState.tab === 'custom') {
        setSelectedTab('custom');
      }
      // Clear the navigation state to prevent repeated refreshes
      navigate(location.pathname, { replace: true });
    } else {
      fetchTemplates(true); // Force refresh to get new data structure
    }
    
    // Load favorites from API
    const loadFavorites = async () => {
      try {
        const response = await reportsService.getFavoriteReports();
        if (response.success && ((response as any).data)) {
          const favoriteIds = new Set(((response as any).data).map((fav: any) => fav.id));
          setFavoriteTemplates(favoriteIds);
        }
      } catch (error) {
        console.error('Failed to load favorites:', error);
      }
    };
    loadFavorites();
  }, [dispatch, fetchTemplates, location, navigate]);

  // Fetch results when results tab is selected
  useEffect(() => {
    if (selectedTab === 'results' && recentResults.length === 0) {
      fetchRecentResults();
    }
  }, [selectedTab, fetchRecentResults, recentResults.length]);

  // Add pulse animation CSS
  useEffect(() => {
    const styleId = 'templates-page-pulse-animation';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.3;
          }
          100% {
            transform: scale(1);
            opacity: 0.5;
          }
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const style = document.getElementById(styleId);
      if (style) {
        style.remove();
      }
    };
  }, []);

  const darkMode = theme === 'dark';

  // Format cell value with data transformations
  const formatCellValue = (value: unknown, columnKey: string): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    
    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length === 0) return '-';
      return value.join(', ');
    }
    
    // Handle other objects
    if (typeof value === 'object' && !(value instanceof Date)) {
      // Check if it's an empty object
      if (Object.keys(value).length === 0) return '-';
      return JSON.stringify(value);
    }
    
    // Check if this looks like an ISO date string
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    }
    
    // Handle Date objects
    if (value instanceof Date) return value.toLocaleString();
    
    // Transform Windows FileTime fields to readable dates
    if ((columnKey === 'lastLogonTimestamp' || columnKey === 'pwdLastSet' || columnKey === 'accountExpires' || 
         columnKey === 'badPasswordTime' || columnKey === 'lockoutTime' || columnKey === 'lastLogon') && 
        (typeof value === 'string' || typeof value === 'number')) {
      const timestamp = typeof value === 'string' ? parseInt(value) : value;
      if (timestamp === 0 || timestamp === 9223372036854775807) {
        return 'Never';
      }
      // Convert Windows FileTime to JavaScript timestamp
      const jsTimestamp = timestamp / 10000 - 11644473600000;
      const date = new Date(jsTimestamp);
      if (isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleString();
    }
    
    // Transform LDAP generalized time fields (YYYYMMDDHHMMSS.0Z format)
    if ((columnKey === 'whenCreated' || columnKey === 'whenChanged') && typeof value === 'string') {
      // Parse LDAP generalized time format: YYYYMMDDHHMMSS.0Z
      const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const date = new Date(Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second)
        ));
        return date.toLocaleString();
      }
      // Check if it's already in ISO format
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
      return String(value);
    }
    
    // Transform UserAccountControl flags to status
    if (columnKey === 'userAccountControl' && typeof value === 'number') {
      const disabled = (value & 0x0002) !== 0;
      const lockedOut = (value & 0x0010) !== 0;
      const passwordNeverExpires = (value & 0x10000) !== 0;
      
      let status = disabled ? 'Disabled' : 'Active';
      if (lockedOut) status += ', Locked';
      if (passwordNeverExpires) status += ', Password Never Expires';
      
      return status;
    }
    
    return String(value);
  };

  // Render results table using EnhancedDataTable
  const renderResultsTable = () => {
    if (!resultData?.results || resultData.results.length === 0) {
      return (
        <div style={{
          padding: '80px',
          textAlign: 'center',
          color: darkMode ? '#9ca3af' : '#6b7280',
          borderRadius: '16px',
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'
        }}>
          <Database size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>No Results</h3>
          <p>No data returned from this query.</p>
        </div>
      );
    }

    // Extract all columns from first row
    const allColumns = Object.keys(resultData.results[0]);
    
    // Filter out columns that have only empty values across all rows
    const columns = allColumns.filter(key => {
      return resultData.results.some((row: any) => hasInformation(row[key]));
    });
    
    // Create columns configuration for EnhancedDataTable
    const enhancedColumns = columns.map(key => ({
      dataIndex: key,
      title: key,
      enableFilter: true,
      // Auto-detect filter type based on data
    }));

    // Custom quick filters based on data source
    const customQuickFilters = selectedResult?.source === 'ad' ? [
      {
        label: 'Active Only',
        filters: {
          userAccountControl: {
            type: 'select' as const,
            value: 'Active'
          }
        }
      },
      {
        label: 'With Email',
        filters: {
          mail: {
            type: 'text' as const,
            value: '@'
          }
        }
      }
    ] : [];

    // Handle export
    const handleExport = async (data: any[], format: 'csv' | 'excel' | 'json') => {
      if (format === 'excel' && selectedResult?.id) {
        // Use backend Excel export for better formatting
        try {
          setLoadingResult(true);
          // Check if this is from history
          if (selectedResult.history_id) {
            await reportsService.exportHistoryResults(selectedResult.history_id, 'excel');
          } else {
            // For fresh executions, we need to use the export endpoint
            const templateId = selectedResult.template_id || selectedResult.custom_template_id;
            if (templateId) {
              const response = await fetch(`${apiService.baseURL}/reports/export/${selectedResult.custom_template_id ? 'custom' : 'report'}/${templateId}`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  format: 'excel',
                  parameters: selectedResult.parameters || {}
                })
              });

              if (!response.ok) throw new Error('Export failed');

              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${selectedResult.report_name || 'report'}_${new Date().toISOString()}.xlsx`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
            }
          }
          message.success('Excel report exported successfully');
        } catch (error) {
          message.error('Failed to export Excel report');
        } finally {
          setLoadingResult(false);
        }
      } else if (format === 'csv') {
        const csv = [
          columns.join(','),
          ...data.map((row: any) => 
            columns.map(col => `"${formatCellValue(row[col], col)}"`).join(',')
          )
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedResult?.report_name || 'report'}_${new Date().toISOString()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('Report exported successfully');
      } else if (format === 'json') {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedResult?.report_name || 'report'}_${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('JSON exported successfully');
      }
    };

    return (
      <EnhancedDataTable
        data={resultData.results}
        columns={enhancedColumns}
        title={`${selectedResult?.report_name || 'Report'} Results`}
        description={`Executed at: ${selectedResult?.executed_at ? dayjs(selectedResult.executed_at).format('YYYY-MM-DD, HH:mm:ss') : 'Unknown'} | Total rows: ${resultData.resultCount || resultData.results.length}`}
        formatCellValue={formatCellValue}
        quickFilters={customQuickFilters}
        onExport={handleExport}
        enableRowSelection={true}
        showExport={true}
        showColumnToggle={true}
        showQuickFilters={true}
        pageSize={50}
      />
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background elements */}
      <div style={{
        position: 'absolute',
        top: '-100px',
        right: '-100px',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(75, 85, 99, 0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse 10s infinite',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-150px',
        left: '-150px',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'pulse 15s infinite',
        animationDelay: '5s',
        pointerEvents: 'none'
      }} />

      {/* Content Container */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '32px'
      }}>
        {/* Header Card */}
        <div style={{
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          padding: '24px',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          marginBottom: '24px'
        }}>
        <div>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 style={{
                fontSize: '30px',
                fontWeight: 'bold',
                marginBottom: '8px',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}>
                Report Templates Hub
              </h1>
              <p style={{ color: darkMode ? '#9ca3af' : '#6b7280' }}>
                Discover and manage report templates for your organization
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {selectedTab === 'custom' && (
                <button
                  onClick={() => {
                    setDefinitions([]); // Clear first for immediate UI feedback
                    fetchTemplates(true); // Force refresh with cache buster
                  }}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: darkMode ? 'rgba(31, 41, 55, 0.8)' : 'white',
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    border: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 1)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    opacity: loading ? 0.6 : 1,
                    boxSizing: 'border-box'
                  }}
                >
                  <RefreshCw style={{ 
                    width: '16px', 
                    height: '16px',
                    animation: loading ? 'spin 1s linear infinite' : 'none'
                  }} />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              )}
              <button
                onClick={() => navigate('/reports/builder')}
                className="btn-gradient"
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  boxSizing: 'border-box'
                }}
              >
                <Plus style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                Create Template
              </button>
            </div>
          </div>

          {/* Stats Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {[
              { label: 'Total Templates', value: stats.total, icon: Layers, color: 'from-blue-400 to-blue-600' },
              { label: 'Total Executions', value: stats.totalRuns.toLocaleString(), icon: Activity, color: 'from-gray-400 to-gray-600' },
              { label: 'Avg Execution Time', value: `${(stats.avgTime / 1000).toFixed(1)}s`, icon: Zap, color: 'from-green-400 to-green-600' },
              { label: 'Success Rate', value: '98%', icon: CheckCircle, color: 'from-cyan-400 to-cyan-600' }
            ].map((stat, idx) => (
              <div
                key={idx}
                style={{
                  background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(10px)',
                  border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.3)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  transition: 'all 0.3s ease'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: `linear-gradient(135deg, ${stat.color})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <stat.icon size={24} color="white" />
                </div>
                <div>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    color: darkMode ? 'white' : '#1f2937'
                  }}>
                    {stat.value}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    {stat.label}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs and Controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            {/* Tabs */}
            <div style={{
              display: 'flex',
              gap: '8px',
              padding: '4px',
              background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(243, 244, 246, 0.8)',
              borderRadius: '12px'
            }}>
              {[
                { id: 'system', label: 'System Templates', icon: Database },
                { id: 'custom', label: 'Custom Templates', icon: Sparkles },
                { id: 'results', label: 'Results', icon: FileBarChart }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id as 'system' | 'custom' | 'results')}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    background: selectedTab === tab.id
                      ? '#4a5568'
                      : 'transparent',
                    color: selectedTab === tab.id
                      ? 'white'
                      : darkMode ? '#9ca3af' : '#6b7280',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 500,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <tab.icon size={18} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View Controls */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: darkMode ? 'rgba(31, 41, 55, 0.8)' : 'white',
                  color: darkMode ? 'white' : '#1f2937',
                  border: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 1)',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <option value="popular">Most Popular</option>
                <option value="recent">Recently Used</option>
                <option value="name">Alphabetical</option>
              </select>

              {/* View Mode Toggle */}
              <div style={{
                display: 'flex',
                gap: '4px',
                padding: '4px',
                background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(243, 244, 246, 0.8)',
                borderRadius: '8px'
              }}>
                {[
                  { id: 'grid', icon: Grid3X3 },
                  { id: 'list', icon: List }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setViewMode(mode.id as 'grid' | 'list')}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      background: viewMode === mode.id
                        ? darkMode ? 'rgba(55, 65, 81, 0.8)' : 'white'
                        : 'transparent',
                      color: viewMode === mode.id
                        ? darkMode ? 'white' : '#1f2937'
                        : darkMode ? '#9ca3af' : '#6b7280',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <mode.icon size={18} />
                  </button>
                ))}
              </div>

              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: showFilters
                    ? '#4a5568'
                    : darkMode ? 'rgba(31, 41, 55, 0.8)' : 'white',
                  color: showFilters ? 'white' : darkMode ? '#9ca3af' : '#6b7280',
                  border: showFilters
                    ? 'none'
                    : darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 1)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
              >
                <Filter size={18} />
                Filters
              </button>
            </div>
          </div>
        </div>
      </div>

        {/* Main Content Card */}
        <div style={{
          background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', gap: '24px' }}>
          {/* Filters Sidebar */}
          {showFilters && (
            <div style={{
              width: '280px',
              flexShrink: 0,
              transition: 'all 0.3s ease'
            }}>
              {/* Search */}
              <div style={{
                marginBottom: '24px',
                position: 'relative'
              }}>
                <Search 
                  size={20} 
                  style={{
                    position: 'absolute',
                    left: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}
                />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 48px',
                    borderRadius: '12px',
                    background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                    color: darkMode ? 'white' : '#1f2937',
                    border: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 1)',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s ease'
                  }}
                />
              </div>

              {/* Categories */}
              <div style={{
                background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                borderRadius: '16px',
                padding: '20px',
                border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)',
                marginBottom: '16px'
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: darkMode ? 'white' : '#1f2937'
                }}>
                  Data Sources
                </h3>
                {[
                  { id: 'all', label: 'All Sources', count: stats.total },
                  { id: 'ad', label: 'Active Directory', icon: UserCheck, count: stats.categories.ad },
                  { id: 'azure', label: 'Azure AD', icon: Cloud, count: stats.categories.azure },
                  { id: 'o365', label: 'Office 365', icon: Mail, count: stats.categories.o365 }
                ].map(cat => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setSelectedSubcategory('all');
                      }}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        background: selectedCategory === cat.id
                          ? darkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)'
                          : 'transparent',
                        border: selectedCategory === cat.id
                          ? '1px solid rgba(59, 130, 246, 0.5)'
                          : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        color: darkMode ? 'white' : '#1f2937'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {Icon && <Icon size={18} />}
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{cat.label}</span>
                      </div>
                      <span style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 1)',
                        color: darkMode ? '#9ca3af' : '#6b7280'
                      }}>
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Subcategories */}
              {availableSubcategories.length > 0 && (
                <div style={{
                  background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                  borderRadius: '16px',
                  padding: '20px',
                  border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    marginBottom: '16px',
                    color: darkMode ? 'white' : '#1f2937'
                  }}>
                    Categories
                  </h3>
                  <button
                    onClick={() => setSelectedSubcategory('all')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      background: selectedSubcategory === 'all'
                        ? darkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)'
                        : 'transparent',
                      border: selectedSubcategory === 'all'
                        ? '1px solid rgba(59, 130, 246, 0.5)'
                        : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      color: darkMode ? 'white' : '#1f2937',
                      fontSize: '14px',
                      fontWeight: 500
                    }}
                  >
                    All Categories
                  </button>
                  {availableSubcategories.map(subcat => {
                    const Icon = subcat.icon;
                    return (
                      <button
                        key={subcat.id}
                        onClick={() => setSelectedSubcategory(subcat.id)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: '8px',
                          background: selectedSubcategory === subcat.id
                            ? darkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)'
                            : 'transparent',
                          border: selectedSubcategory === subcat.id
                            ? '1px solid rgba(59, 130, 246, 0.5)'
                            : '1px solid transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          color: darkMode ? 'white' : '#1f2937'
                        }}
                      >
                        <Icon size={18} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: 500 }}>{subcat.name}</div>
                          <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                            {subcat.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Templates Content */}
          <div key={refreshKey} style={{ flex: 1 }}>
            {loading ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr',
                gap: '16px'
              }}>
                {[...Array(6)].map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                      borderRadius: '16px',
                      padding: '24px',
                      border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)',
                      animation: 'pulse 2s infinite'
                    }}
                  >
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)',
                      marginBottom: '16px'
                    }} />
                    <div style={{
                      height: '20px',
                      borderRadius: '4px',
                      background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)',
                      marginBottom: '8px'
                    }} />
                    <div style={{
                      height: '16px',
                      borderRadius: '4px',
                      background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)',
                      width: '80%'
                    }} />
                  </div>
                ))}
              </div>
            ) : selectedTab === 'results' ? (
              // Results View
              <div>
                {selectedResult && resultData ? (
                  // Show selected report data
                  <div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: 32 
                    }}>
                      <div>
                        <h2 style={{ 
                          margin: 0, 
                          fontSize: '32px',
                          fontWeight: 'bold',
                          color: darkMode ? 'white' : '#1f2937',
                          marginBottom: '8px'
                        }}>
                          Report Results
                        </h2>
                        <p style={{ 
                          margin: 0,
                          fontSize: '16px',
                          color: darkMode ? '#9ca3af' : '#6b7280'
                        }}>
                          {selectedResult.report_name || selectedResult.template_name} - Executed {dayjs(selectedResult.executed_at).format('MMM D, YYYY h:mm A')}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setSelectedResult(null);
                            setResultData(null);
                          }}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                            background: 'transparent',
                            color: darkMode ? '#d1d5db' : '#4b5563',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <X size={16} />
                          Close
                        </button>
                      </div>
                    </div>

                    {/* Results Summary */}
                    <div style={{
                      display: 'flex',
                      gap: '16px',
                      marginBottom: 24
                    }}>
                      <div style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                        flex: 1
                      }}>
                        <div style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Total Records</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: darkMode ? 'white' : '#1f2937' }}>
                          {resultData.results?.length || 0}
                        </div>
                      </div>
                      <div style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                        flex: 1
                      }}>
                        <div style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Execution Time</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: darkMode ? 'white' : '#1f2937' }}>
                          {(selectedResult.execution_time_ms / 1000).toFixed(1)}s
                        </div>
                      </div>
                      <div style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)',
                        flex: 1
                      }}>
                        <div style={{ fontSize: '14px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Data Source</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: darkMode ? 'white' : '#1f2937' }}>
                          {(selectedResult.source || 'Unknown').toUpperCase()}
                        </div>
                      </div>
                    </div>

                    {/* Filter and Export Controls */}
                    <div style={{
                      display: 'flex',
                      gap: '16px',
                      marginBottom: 24,
                      alignItems: 'center'
                    }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <Filter size={18} style={{
                          position: 'absolute',
                          left: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: darkMode ? '#9ca3af' : '#6b7280'
                        }} />
                        {/* Filter input removed - now handled by EnhancedDataTable */}
                      </div>
                      {/* Export button removed - now handled by EnhancedDataTable */}
                    </div>

                    {/* Results Table */}
                    {loadingResult ? (
                      <div style={{
                        textAlign: 'center',
                        padding: '60px'
                      }}>
                        <RefreshCw size={32} style={{ 
                          color: '#3b82f6',
                          animation: 'spin 1s linear infinite'
                        }} />
                        <p style={{
                          marginTop: '16px',
                          color: darkMode ? '#9ca3af' : '#6b7280'
                        }}>
                          Loading report data...
                        </p>
                      </div>
                    ) : (
                      renderResultsTable()
                    )}
                  </div>
                ) : recentResults.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '80px 20px'
                  }}>
                    <div style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 24px'
                    }}>
                      <FileBarChart size={48} style={{ color: '#3b82f6' }} />
                    </div>
                    <h3 style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      marginBottom: '8px',
                      color: darkMode ? 'white' : '#1f2937'
                    }}>
                      No recent results
                    </h3>
                    <p style={{
                      color: darkMode ? '#9ca3af' : '#6b7280',
                      marginBottom: '24px'
                    }}>
                      Run some reports to see results here
                    </p>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '16px'
                  }}>
                    {recentResults.map((result) => (
                      <div
                        key={result.id}
                        style={{
                          background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                          borderRadius: '16px',
                          padding: '24px',
                          border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease'
                        }}
                        onClick={() => handleResultSelect(result)}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-4px)';
                          e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '16px'
                        }}>
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: result.status === 'success' 
                              ? 'linear-gradient(135deg, #10b981, #059669)'
                              : 'linear-gradient(135deg, #ef4444, #dc2626)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {result.status === 'success' ? 
                              <CheckCircle size={24} color="white" /> : 
                              <AlertCircle size={24} color="white" />
                            }
                          </div>
                          <span style={{
                            fontSize: '12px',
                            color: darkMode ? '#9ca3af' : '#6b7280'
                          }}>
                            {dayjs(result.executed_at).fromNow()}
                          </span>
                        </div>
                        <h4 style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          marginBottom: '8px',
                          color: darkMode ? 'white' : '#1f2937'
                        }}>
                          {result.report_name || result.template_name || 'Report'}
                        </h4>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          fontSize: '14px',
                          color: darkMode ? '#9ca3af' : '#6b7280'
                        }}>
                          <span>{result.result_count || 0} rows</span>
                          <span>{(result.execution_time_ms / 1000).toFixed(2)}s</span>
                          {result.export_format && (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: darkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
                              color: '#3b82f6',
                              fontSize: '12px'
                            }}>
                              {result.export_format.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '80px 20px'
              }}>
                <div style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  background: darkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(75, 85, 99, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px'
                }}>
                  <Search size={48} style={{ color: '#4b5563' }} />
                </div>
                <h3 style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                  color: darkMode ? 'white' : '#1f2937'
                }}>
                  No templates found
                </h3>
                <p style={{
                  color: darkMode ? '#9ca3af' : '#6b7280',
                  marginBottom: '24px'
                }}>
                  Try adjusting your filters or search query
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedSubcategory('all');
                  }}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '12px',
                    background: darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(243, 244, 246, 1)',
                    color: darkMode ? 'white' : '#1f2937',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.2s ease'
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px'
              }}>
                {filteredTemplates.map((template) => {
                  const Icon = getIconForDataSource(template.dataSource);
                  const isFavorite = favoriteTemplates.has(template.id);
                  const isRecent = recentTemplates.includes(template.id);
                  
                  return (
                    <div
                      key={template.id}
                      style={{
                        background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                        borderRadius: '16px',
                        padding: '24px',
                        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      onClick={() => handleTemplateClick(template)}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      {/* Favorite Button */}
                      <button
                        onClick={(e) => toggleFavorite(e, template.id)}
                        style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          padding: '8px',
                          borderRadius: '8px',
                          background: isFavorite
                            ? 'rgba(251, 191, 36, 0.1)'
                            : darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          zIndex: 1
                        }}
                      >
                        <Star
                          size={16}
                          style={{
                            color: isFavorite ? '#fbbf24' : darkMode ? '#9ca3af' : '#6b7280',
                            fill: isFavorite ? '#fbbf24' : 'none'
                          }}
                        />
                      </button>

                      {/* Recent Badge */}
                      {isRecent && (
                        <div style={{
                          position: 'absolute',
                          top: '16px',
                          left: '16px',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          background: 'rgba(34, 197, 94, 0.1)',
                          color: '#22c55e',
                          fontSize: '12px',
                          fontWeight: 500
                        }}>
                          Recent
                        </div>
                      )}

                      {/* Icon */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: `linear-gradient(135deg, ${getColorForDataSource(template.dataSource)})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px'
                      }}>
                        <Icon size={24} color="white" />
                      </div>

                      {/* Content */}
                      <h4 style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        marginBottom: '8px',
                        color: darkMode ? 'white' : '#1f2937'
                      }}>
                        {template.name}
                      </h4>
                      <p style={{
                        fontSize: '14px',
                        color: darkMode ? '#9ca3af' : '#6b7280',
                        marginBottom: '16px',
                        lineHeight: 1.5
                      }}>
                        {template.description}
                      </p>

                      {/* Tags */}
                      {template.tags && template.tags.length > 0 && (
                        <div style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          marginBottom: '16px'
                        }}>
                          {template.tags.slice(0, 3).map(tag => (
                            <span
                              key={tag}
                              style={{
                                padding: '4px 12px',
                                borderRadius: '20px',
                                background: darkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(75, 85, 99, 0.1)',
                                color: '#4b5563',
                                fontSize: '12px',
                                fontWeight: 500
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Stats */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '16px',
                        borderTop: darkMode ? '1px solid rgba(55, 65, 81, 0.5)' : '1px solid rgba(229, 231, 235, 0.5)'
                      }}>
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Activity size={14} style={{ color: darkMode ? '#9ca3af' : '#6b7280' }} />
                            <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                              {template.executionCount} runs
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={14} style={{ color: darkMode ? '#9ca3af' : '#6b7280' }} />
                            <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                              {template.avgExecutionTime ? `${(template.avgExecutionTime / 1000).toFixed(1)}s` : 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunTemplate(template);
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: '#4a5568',
                              color: 'white',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <Play size={12} />
                            Run
                          </button>
                          {template.isCustom && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditTemplate(template);
                                }}
                                style={{
                                  padding: '6px',
                                  borderRadius: '6px',
                                  background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)',
                                  color: darkMode ? '#9ca3af' : '#6b7280',
                                  border: 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                                title="Edit template"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTemplate(template);
                                }}
                                style={{
                                  padding: '6px',
                                  borderRadius: '6px',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#ef4444',
                                  border: 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                                title="Delete template"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredTemplates.map((template) => {
                  const Icon = getIconForDataSource(template.dataSource);
                  const isFavorite = favoriteTemplates.has(template.id);
                  
                  return (
                    <div
                      key={template.id}
                      style={{
                        background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
                        borderRadius: '12px',
                        padding: '20px',
                        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px'
                      }}
                      onClick={() => handleTemplateClick(template)}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = darkMode ? 'rgba(31, 41, 55, 0.7)' : 'rgba(249, 250, 251, 1)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white';
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: `linear-gradient(135deg, ${getColorForDataSource(template.dataSource)})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Icon size={24} color="white" />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                          <h4 style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: darkMode ? 'white' : '#1f2937'
                          }}>
                            {template.name}
                          </h4>
                          {template.tags && template.tags.map(tag => (
                            <span
                              key={tag}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: darkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(75, 85, 99, 0.1)',
                                color: '#4b5563',
                                fontSize: '11px',
                                fontWeight: 500
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p style={{
                          fontSize: '14px',
                          color: darkMode ? '#9ca3af' : '#6b7280',
                          marginBottom: '8px'
                        }}>
                          {template.description}
                        </p>
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                            {template.executionCount} runs
                          </span>
                          <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                            {template.avgExecutionTime ? `${(template.avgExecutionTime / 1000).toFixed(1)}s avg` : 'No data'}
                          </span>
                          {template.lastExecuted && (
                            <span style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                              Last run {dayjs(template.lastExecuted).fromNow()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={(e) => toggleFavorite(e, template.id)}
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <Star
                            size={16}
                            style={{
                              color: isFavorite ? '#fbbf24' : darkMode ? '#9ca3af' : '#6b7280',
                              fill: isFavorite ? '#fbbf24' : 'none'
                            }}
                          />
                        </button>
                        {template.isCustom && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditTemplate(template);
                              }}
                              style={{
                                padding: '8px',
                                borderRadius: '8px',
                                background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              title="Edit template"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTemplate(template);
                              }}
                              style={{
                                padding: '8px',
                                borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              title="Delete template"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunTemplate(template);
                          }}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: '#4a5568',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <Play size={16} />
                          Run
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Details Panel */}
          {showDetails && selectedTemplate && (
            <div style={{
              width: '400px',
              flexShrink: 0,
              background: darkMode ? 'rgba(31, 41, 55, 0.5)' : 'white',
              borderRadius: '16px',
              padding: '24px',
              border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 0.5)',
              marginLeft: '24px',
              height: 'fit-content',
              position: 'sticky',
              top: '24px'
            }}>
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowDetails(false);
                  setSelectedTemplate(null);
                }}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  padding: '8px',
                  borderRadius: '8px',
                  background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Template Details */}
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: `linear-gradient(135deg, ${getColorForDataSource(selectedTemplate.dataSource)})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px'
              }}>
                {(() => {
                  const Icon = getIconForDataSource(selectedTemplate.dataSource);
                  return <Icon size={28} color="white" />;
                })()}
              </div>

              <h3 style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '8px',
                color: darkMode ? 'white' : '#1f2937'
              }}>
                {selectedTemplate.name}
              </h3>

              <p style={{
                fontSize: '14px',
                color: darkMode ? '#9ca3af' : '#6b7280',
                marginBottom: '24px',
                lineHeight: 1.6
              }}>
                {selectedTemplate.description}
              </p>

              {/* Quick Actions */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button
                  onClick={() => handleRunTemplate(selectedTemplate)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    background: '#4a5568',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Play size={18} />
                  Run Report
                </button>
                <button
                  onClick={() => handleEditTemplate(selectedTemplate)}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 1)',
                    color: darkMode ? 'white' : '#1f2937',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  title={selectedTemplate.isCustom ? 'Edit template' : 'System templates cannot be edited'}
                >
                  <Edit size={18} />
                </button>
                <button
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 1)',
                    color: darkMode ? 'white' : '#1f2937',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Share2 size={18} />
                </button>
                {selectedTemplate.isCustom && (
                  <button
                    onClick={() => handleDeleteTemplate(selectedTemplate)}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      background: darkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    title="Delete template"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              {/* Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h4 style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    marginBottom: '8px'
                  }}>
                    Statistics
                  </h4>
                  <div style={{
                    background: darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(243, 244, 246, 0.5)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: darkMode ? 'white' : '#1f2937' }}>
                        {selectedTemplate.executionCount}
                      </div>
                      <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                        Total Runs
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: darkMode ? 'white' : '#1f2937' }}>
                        {selectedTemplate.avgExecutionTime ? `${(selectedTemplate.avgExecutionTime / 1000).toFixed(1)}s` : 'N/A'}
                      </div>
                      <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                        Avg Time
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: darkMode ? 'white' : '#1f2937' }}>
                        {selectedTemplate.successRate || 'N/A'}
                      </div>
                      <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                        Success Rate
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 600, color: darkMode ? 'white' : '#1f2937' }}>
                        {selectedTemplate.parameters?.length || 0}
                      </div>
                      <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                        Parameters
                      </div>
                    </div>
                  </div>
                </div>

                {selectedTemplate.tags && selectedTemplate.tags.length > 0 && (
                  <div>
                    <h4 style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: darkMode ? '#9ca3af' : '#6b7280',
                      marginBottom: '8px'
                    }}>
                      Tags
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {selectedTemplate.tags.map(tag => (
                        <span
                          key={tag}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '20px',
                            background: darkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(75, 85, 99, 0.1)',
                            color: '#4b5563',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTemplate.lastExecuted && (
                  <div>
                    <h4 style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: darkMode ? '#9ca3af' : '#6b7280',
                      marginBottom: '8px'
                    }}>
                      Recent Activity
                    </h4>
                    <div style={{
                      background: darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(243, 244, 246, 0.5)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <History size={16} style={{ color: darkMode ? '#9ca3af' : '#6b7280' }} />
                      <div>
                        <div style={{ fontSize: '14px', color: darkMode ? 'white' : '#1f2937' }}>
                          Last executed {dayjs(selectedTemplate.lastExecuted).fromNow()}
                        </div>
                        <div style={{ fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280' }}>
                          {dayjs(selectedTemplate.lastExecuted).format('MMM D, YYYY h:mm A')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Report Execution Modal */}
      {parameterModalOpen && selectedTemplate && (
        <ReportExecutionModal
          queryDefinition={selectedTemplate}
          onClose={() => {
            setParameterModalOpen(false);
            setSelectedTemplate(null);
          }}
          onExecute={handleExecuteReport}
        />
      )}
    </div>
  );
};

export default TemplatesPageV2;