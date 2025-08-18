/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  Settings, 
  Activity, 
  TrendingUp, 
  UserCheck,
  ChevronRight,
  Clock,
  CheckCircle,
  Download,
  RefreshCw,
  MoreVertical,
  Pause,
  Play,
  Shield,
  Mail,
  FileSpreadsheet,
  Key,
  Cloud,
  Users,
  Server,
  Lock,
  AlertTriangle,
  FileText,
  Target,
  Zap,
  Layers,
  Calendar
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store';
import { setBreadcrumbs, setCurrentPage, toggleDarkMode, selectTheme } from '@/store/slices/uiSlice';
import { selectTemplates, selectReportHistory, fetchReportTemplatesAsync, selectReports, selectFavoriteReports, fetchFavoriteReportsAsync } from '@/store/slices/reportsSlice';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { ReportExecutionModal } from '@/components/reports/ReportExecutionModal';
import { useQueryExecution } from '@/hooks/useQuery';
import { QueryDefinition } from '@/types';
import { reportsService } from '@/services/reportsService';

// Animated counter hook
const useCounter = (target: number, duration = 2000) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const increment = target / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start > target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    
    return () => clearInterval(timer);
  }, [target, duration]);
  
  return count;
};

// ====================== Child Components ======================

interface StatCardProps {
  target: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bgGlow: string;
  darkMode: boolean;
}

// Memoized stat card isolates the animation re-renders
const StatCard: React.FC<StatCardProps> = React.memo(({ target, title, subtitle, icon: Icon, color, bgGlow, darkMode }) => {
  const value = useCounter(target);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px 20px',
        borderRadius: '12px',
        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        minWidth: '200px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      }}
    >
      <div style={{
        padding: '8px',
        borderRadius: '8px',
        background: `linear-gradient(135deg, ${color})`,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
      }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: darkMode ? 'white' : '#1f2937',
          lineHeight: 1
        }}>
          {title === 'Data Processed' ? `${value.toFixed(1)} GB` : value.toLocaleString()}
        </div>
        <div style={{
          fontSize: '12px',
          color: darkMode ? '#9ca3af' : '#6b7280',
          fontWeight: 500
        }}>
          {title}
        </div>
      </div>
    </div>
  );
});

const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const theme = useAppSelector(selectTheme);
  // Select data from Redux store
  const reportsState = useAppSelector(selectReports);
  const templates = useAppSelector(selectTemplates);
  const reportHistory = useAppSelector(selectReportHistory);
  const favoriteReports = useAppSelector(selectFavoriteReports);
  const templatesLoading = reportsState.templatesLoading;
  const templatesError = reportsState.templatesError;
  const favoritesLoading = reportsState.favoritesLoading;
  
  // Dashboard stats from unified API
  const { stats: reportStats, loading: statsLoading, error: statsError, refetch: refetchStats } = useDashboardStats();
  const hasErrors = statsError;
  
  // Query execution hook
  const { execute } = useQueryExecution();
  
  const [loading, setLoading] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<QueryDefinition | null>(null);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  
  const darkMode = theme.darkMode;

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'dashboard', title: 'Dashboard' }));
    dispatch(setBreadcrumbs([{ title: 'Dashboard' }]));
    
    // Fetch report templates
    dispatch(fetchReportTemplatesAsync());
    
    // Fetch favorite reports
    dispatch(fetchFavoriteReportsAsync());
    
    // Stats are fetched automatically by the useDashboardStats hook
  }, [dispatch]);


  // Transform reportsBySource data for pie chart
  const reportCategories = reportStats?.reportsBySource ? 
    Object.entries(reportStats.reportsBySource).map(([name, value], index) => ({
      name: name === 'ad' ? 'Active Directory' : name === 'azure' ? 'Azure AD' : name === 'o365' ? 'Office 365' : name,
      value,
      color: ['#4a5568', '#6b7280', '#374151', '#4b5563'][index % 4]
    })) : [];

  // Dashboard stats from real data
  const stats = React.useMemo(() => ([
    { 
      title: 'Reports Generated', 
      value: reportStats?.totalExecutions || 0, 
      subtitle: 'Total executions', 
      icon: BarChart3, 
      color: '#4a5568, #6b7280',
      bgGlow: 'bg-blue-500/20'
    },
    { 
      title: 'Custom Reports', 
      value: reportStats?.totalCustomReports || 0, 
      subtitle: 'Created by users', 
      icon: Settings, 
      color: '#374151, #4b5563',
      bgGlow: 'bg-gray-500/20'
    },
    { 
      title: 'Pre-built Templates', 
      value: reportStats?.totalReports || 0, 
      subtitle: 'Available templates', 
      icon: Layers, 
      color: '#4b5563, #6b7280',
      bgGlow: 'bg-emerald-500/20'
    },
    { 
      title: 'Recent Activity', 
      value: reportStats?.recentExecutions?.length || 0, 
      subtitle: 'Recent reports', 
      icon: Activity, 
      color: '#6b7280, #9ca3af',
      bgGlow: 'bg-amber-500/20'
    },
  ]), [reportStats]);

  // Helper functions (defined outside memo hooks to keep referential stability)
  const getIconForCategory = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'ad': return Users;
      case 'azure': return Cloud;
      case 'o365': return Mail;
      case 'user management': return UserCheck;
      case 'security': return Lock;
      case 'office 365': return Mail;
      case 'compliance': return FileSpreadsheet;
      case 'users': return Users;
      case 'computers': return Server;
      case 'groups': return Target;
      case 'system': return Zap;
      case 'reports': return BarChart3;
      default: return FileText;
    }
  };

  const getColorForCategory = (category: string) => {
    const categoryColors: { [key: string]: string } = {
      'ad': '#4a5568, #374151',
      'azure': '#374151, #1f2937',
      'o365': '#6b7280, #4b5563',
      'office 365': '#6b7280, #4b5563',
      'user management': '#4b5563, #374151',
      'security': '#374151, #1f2937',
      'compliance': '#4b5563, #374151',
      'users': '#4a5568, #374151',
      'computers': '#64748b, #475569',
      'groups': '#374151, #4b5563',
      'system': '#6b7280, #4b5563',
      'reports': '#4b5563, #374151'
    };
    
    const categoryKey = category?.toLowerCase() || '';
    return categoryColors[categoryKey] || '#6b7280, #4b5563';
  };

  // Memoized transformations to avoid heavy computations on every re-render
  const reportTemplates = React.useMemo(() => {
    if (!Array.isArray(templates)) return [];
    return templates.map((template: any) => ({
      id: template.id,
      name: template.name,
      category: template.category || template.dataSource,
      dataSource: template.dataSource, // Preserve dataSource field
      description: template.description,
      icon: getIconForCategory(template.category || template.dataSource),
      color: getColorForCategory(template.category || template.dataSource),
      lastRun: template.executionCount > 0 ? 'Recently' : 'Never',
      avgTime: template.avgExecutionTime ? `${Math.round(template.avgExecutionTime / 1000)}s` : 'N/A'
    }));
  }, [templates]);

  const recentReports = React.useMemo(() => {
    if (!Array.isArray(reportHistory)) return [];
    return reportHistory.map((report: any) => ({
      id: report.id,
      name: report.report_name || 'Untitled Report',
      template: report.report_name || 'Custom Report',
      date: new Date(report.generated_at).toLocaleString(),
      status: report.status,
      size: report.row_count ? `${report.row_count} rows` : '-',
      format: report.export_format || 'JSON'
    }));
  }, [reportHistory]);

  const scheduledReports = [
    { id: 1, name: 'Weekly Inactive Users', template: 'Inactive Users Report', schedule: 'Every Monday 9:00 AM', nextRun: 'In 2 days', status: 'active' },
    { id: 2, name: 'Monthly License Report', template: 'License Usage Analysis', schedule: '1st of month 8:00 AM', nextRun: 'In 12 days', status: 'active' },
    { id: 3, name: 'Daily Security Audit', template: 'Security Permissions Audit', schedule: 'Daily 6:00 PM', nextRun: 'In 5 hours', status: 'paused' },
  ];

  const handleGenerateReport = (template: any) => {
    // Convert template to QueryDefinition format
    const queryDef: QueryDefinition = {
      id: template.id,
      name: template.name,
      description: template.description,
      version: "1.0.0",
      dataSource: template.dataSource || 
                  (template.category?.toLowerCase() === 'ad' ? 'ad' : 
                   template.category?.toLowerCase() === 'azure' ? 'azure' : 
                   template.category?.toLowerCase() === 'o365' ? 'o365' : 
                   template.category?.toLowerCase() === 'users' ? 'ad' :
                   template.category?.toLowerCase() === 'computers' ? 'ad' :
                   template.category?.toLowerCase() === 'groups' ? 'ad' : 'ad'),
      category: template.category,
      parameters: template.parameters || {},
      sql: template.sql || '',
      resultMapping: template.resultMapping || {}
    };
    
    setSelectedTemplate(queryDef);
    setExecutionModalOpen(true);
  };
  
  const handleExecuteReport = async (queryId: string, parameters: Record<string, any>, options?: any) => {
    try {
      // Use reportsService to execute templates (same as templates page)
      const result = await reportsService.executeReport(
        queryId, 
        parameters, 
        options?.credentialId
      );
      
      if (!result.success || !((result as any)?.data)) {
        throw new Error(result.error || 'Report execution failed');
      }
      
      return ((result as any)?.data);
    } catch (error) {
      console.error('Execution failed:', error);
      throw error;
    }
  };

  const exportFormats = ['PDF', 'Excel', 'CSV', 'PowerBI', 'JSON'];

  return (
    <div style={{ 
      minHeight: 'calc(100vh - 64px)',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      transition: 'all 0.5s ease',
      position: 'relative',
      overflow: 'auto'
    }}>
      {/* Animated Background */}
      <div style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0
      }}>
        <div style={{
          position: 'absolute',
          top: '-10rem',
          right: '-10rem',
          width: '20rem',
          height: '20rem',
          background: darkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(75, 85, 99, 0.2)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          animation: 'pulse 4s ease-in-out infinite'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10rem',
          left: '-10rem',
          width: '20rem',
          height: '20rem',
          background: darkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          animation: 'pulse 4s ease-in-out infinite 2s'
        }} />
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '24rem',
          height: '24rem',
          background: darkMode ? 'rgba(236, 72, 153, 0.05)' : 'rgba(236, 72, 153, 0.15)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          animation: 'pulse 4s ease-in-out infinite 1s'
        }} />
      </div>

      {/* Dark Mode Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '32px 32px 0',
        position: 'relative',
        zIndex: 1
      }}>
        <button
          onClick={() => dispatch(toggleDarkMode())}
          style={{
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {darkMode ? '🌞' : '🌙'}
        </button>
      </div>

      {/* Content Area */}
      <div style={{ padding: '0 32px 32px', position: 'relative', zIndex: 1, paddingBottom: '64px' }}>
        <div>
            {/* Page Title */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '32px',
                fontWeight: 'bold',
                color: darkMode ? 'white' : '#1f2937',
                marginBottom: '8px'
              }}>
                Reporting Dashboard
              </h2>
              <p style={{ 
                margin: 0,
                fontSize: '16px',
                color: darkMode ? '#9ca3af' : '#6b7280'
              }}>
                Generate comprehensive reports for Active Directory, Azure AD, and Office 365
              </p>
              
              {/* Error Banner */}
              {hasErrors && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626'
                }}>
                  <strong>Connection Error:</strong> Unable to load some data from the backend. Please check your connection.
                </div>
              )}
            </div>

            {/* Compact Stats Row */}
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: '16px', 
              marginBottom: 32 
            }}>
              {statsLoading ? (
                // Loading skeleton for stats
                [...Array(4)].map((_, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(20px)',
                      border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      minWidth: '200px'
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.2)',
                      animation: 'pulse 1.5s ease-in-out infinite'
                    }} />
                    <div>
                      <div style={{
                        width: '60px',
                        height: '20px',
                        borderRadius: '4px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.2)',
                        marginBottom: '4px',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }} />
                      <div style={{
                        width: '80px',
                        height: '12px',
                        borderRadius: '4px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.2)',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }} />
                    </div>
                  </div>
                ))
              ) : (
                stats.map((stat, index) => (
                  <StatCard
                    key={index}
                    target={stat.value}
                    title={stat.title}
                    subtitle={stat.subtitle}
                    icon={stat.icon}
                    color={stat.color}
                    bgGlow={stat.bgGlow}
                    darkMode={darkMode}
                  />
                ))
              )}
            </div>

            {/* Charts Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
              gap: '24px',
              marginBottom: 32
            }}>
              {/* Recent Activity Overview */}
              <div
                style={{
                  borderRadius: '16px',
                  background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(20px)',
                  border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  padding: '24px'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: 24 
                }}>
                  <h3 style={{ 
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '600',
                    color: darkMode ? 'white' : '#1f2937'
                  }}>Recent Activity</h3>
                  <button
                    onClick={() => refetchStats()}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '8px',
                      border: darkMode ? '1px solid #4b5563' : '1px solid #d1d5db',
                      fontSize: '14px',
                      background: darkMode ? '#374151' : '#f9fafb',
                      color: darkMode ? '#f3f4f6' : '#1f2937',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
                {reportStats?.recentExecutions && reportStats.recentExecutions.length > 0 ? (
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {reportStats.recentExecutions.slice(0, 5).map((execution: any, index: number) => (
                      <div
                        key={execution.id || index}
                        style={{
                          padding: '12px',
                          marginBottom: '8px',
                          borderRadius: '8px',
                          background: darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(107, 114, 128, 0.05)',
                          border: darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(107, 114, 128, 0.1)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(107, 114, 128, 0.05)';
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: darkMode ? 'white' : '#1f2937',
                            marginBottom: '4px'
                          }}>
                            {execution.reportName}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: darkMode ? '#9ca3af' : '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>{new Date(execution.generatedAt).toLocaleDateString()}</span>
                            {execution.rowCount && (
                              <>
                                <span>•</span>
                                <span>{execution.rowCount} rows</span>
                              </>
                            )}
                            {execution.executionTimeMs && (
                              <>
                                <span>•</span>
                                <span>{(execution.executionTimeMs / 1000).toFixed(1)}s</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{
                          padding: '4px 8px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '500',
                          background: execution.status === 'completed' 
                            ? 'rgba(16, 185, 129, 0.1)' 
                            : 'rgba(245, 158, 11, 0.1)',
                          color: execution.status === 'completed' 
                            ? '#4b5563' 
                            : '#6b7280',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {execution.status === 'completed' ? <CheckCircle size={12} /> : <Clock size={12} />}
                          {execution.status}
                        </div>
                      </div>
                    ))}
                    {reportStats.recentExecutions.length > 5 && (
                      <button
                        onClick={() => navigate('/reports/history')}
                        style={{
                          width: '100%',
                          padding: '8px',
                          marginTop: '8px',
                          borderRadius: '8px',
                          border: 'none',
                          background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.1)',
                          color: darkMode ? '#d1d5db' : '#4b5563',
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        View all history
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{
                    height: 300,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    <Clock size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                    <p style={{ fontSize: '16px', margin: 0 }}>No recent activity</p>
                    <p style={{ fontSize: '14px', margin: '8px 0 0 0', opacity: 0.8 }}>
                      Generate some reports to see activity
                    </p>
                  </div>
                )}
              </div>

              {/* Report Categories */}
              <div
                style={{
                  borderRadius: '16px',
                  background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(20px)',
                  border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  padding: '24px'
                }}
              >
                <h3 style={{ 
                  marginBottom: 24,
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: darkMode ? 'white' : '#1f2937'
                }}>Reports by Category</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportCategories}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {reportCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Access Templates */}
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: 16 
              }}>
                <h3 style={{ 
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: darkMode ? 'white' : '#1f2937'
                }}>Favorite Reports</h3>
                <button
                  onClick={() => navigate('/reports')}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    color: darkMode ? '#9ca3af' : '#6b7280',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  View all templates
                  <ChevronRight size={16} />
                </button>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: window.innerWidth < 640 ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '16px',
                width: '100%'
              }}>
                {favoritesLoading ? (
                  // Loading skeleton for templates
                  [...Array(3)].map((_, index) => (
                    <div
                      key={index}
                      style={{
                        borderRadius: '12px',
                        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                        backdropFilter: 'blur(20px)',
                        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        padding: '24px'
                      }}
                    >
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.2)',
                        marginBottom: '16px',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }} />
                      <div style={{
                        width: '60%',
                        height: '20px',
                        borderRadius: '4px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.2)',
                        marginBottom: '8px',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }} />
                      <div style={{
                        width: '100%',
                        height: '14px',
                        borderRadius: '4px',
                        background: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(107, 114, 128, 0.2)',
                        animation: 'pulse 1.5s ease-in-out infinite'
                      }} />
                    </div>
                  ))
                ) : favoriteReports.length === 0 ? (
                  <div style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '40px',
                    color: darkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    You haven't marked any reports as favorites yet. Star your frequently used reports to see them here.
                  </div>
                ) : (
                  favoriteReports.slice(0, 6).map((template) => {
                  const IconComponent = getIconForCategory(template.category || template.dataSource);
                  return (
                    <div
                      key={template.id}
                      style={{
                        borderRadius: '12px',
                        background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                        backdropFilter: 'blur(20px)',
                        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        transition: 'all 0.3s ease',
                        overflow: 'hidden',
                        position: 'relative',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                      }}
                    >
                      <div style={{ position: 'relative', padding: '24px' }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'flex-start', 
                          marginBottom: 16 
                        }}>
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: darkMode ? 'rgba(55, 65, 81, 0.8)' : '#e5e7eb',
                            color: darkMode ? 'white' : '#374151',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
                          }}>
                            <IconComponent size={24} />
                          </div>
                        <button
                          style={{
                            padding: '8px 16px',
                            background: '#4a5568',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            opacity: 1,
                            transition: 'all 0.3s ease'
                          }}
                          onClick={() => handleGenerateReport(template)}
                        >
                          Generate
                        </button>
                      </div>
                      <h4 style={{ 
                        margin: '0 0 8px 0',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: darkMode ? 'white' : '#1f2937'
                      }}>{template.name}</h4>
                      <p style={{ 
                        fontSize: '14px', 
                        lineHeight: 1.4,
                        color: darkMode ? '#9ca3af' : '#6b7280',
                        margin: 0
                      }}>
                        {template.description}
                      </p>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        marginTop: 16, 
                        paddingTop: 16, 
                        borderTop: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                        fontSize: '12px',
                        color: darkMode ? '#9ca3af' : '#6b7280'
                      }}>
                        <span>Last run: {template.lastRun}</span>
                        <span>Avg: {template.avgTime}</span>
                      </div>
                    </div>
                  </div>
                  );
                })
                )}
              </div>
            </div>
          </div>
        
        {/* Report Execution Modal */}
        {executionModalOpen && selectedTemplate && (
          <ReportExecutionModal
            queryDefinition={selectedTemplate}
            onClose={() => {
              setExecutionModalOpen(false);
              setSelectedTemplate(null);
            }}
            onExecute={handleExecuteReport}
          />
        )}
      </div>
    </div>
  );
};

export default DashboardPage;