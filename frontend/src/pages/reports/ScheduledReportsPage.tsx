/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import { message, Modal, Form, Input, Select, TimePicker, InputNumber, Switch } from 'antd';
import { 
  Plus,
  Calendar,
  Clock,
  Mail,
  FileSpreadsheet,
  MoreVertical,
  Edit,
  Trash2,
  Power,
  History,
  Play,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  Download
} from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { setBreadcrumbs, setCurrentPage } from '@/store/slices/uiSlice';
import { selectTheme } from '@/store/slices/uiSlice';
import { scheduledReportsService, ReportSchedule, CreateScheduleDto, UpdateScheduleDto, ScheduleConfig } from '@/services/scheduledReportsService';
import { reportsService } from '@/services/reportsService';
import { formatDate } from '@/utils/formatters';
import '@/App.css';

const { Option } = Select;
const { TextArea } = Input;

const ScheduledReportsPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const darkMode = useAppSelector(selectTheme).darkMode;
  
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [scheduleHistory, setScheduleHistory] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [customTemplates, setCustomTemplates] = useState<any[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  
  const [form] = Form.useForm();

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'scheduled-reports', title: 'Scheduled Reports' }));
    dispatch(setBreadcrumbs([
      { title: 'Dashboard', path: '/dashboard' },
      { title: 'Reports', path: '/reports' },
      { title: 'Scheduled Reports' }
    ]));
    
    // Initial load
    fetchSchedules();
    fetchTemplates();
  }, [dispatch]);
  
  // Set up polling to refresh schedules
  useEffect(() => {
    // Start polling after initial load
    const interval = setInterval(() => {
      // Only refresh if modal is not open (don't check loading to prevent race conditions)
      if (!modalOpen) {
        fetchSchedules(selectedStatus, false); // false = don't show loading spinner
      }
    }, 30000); // 30 seconds
    
    // Cleanup on unmount
    return () => {
      clearInterval(interval);
    };
  }, [modalOpen, selectedStatus]); // Dependencies ensure fresh values in closure
  
  // Refetch schedules when filter changes
  useEffect(() => {
    fetchSchedules();
  }, [selectedStatus]);
  
  // Add a manual refresh function
  const refreshSchedules = async () => {
    setSchedules([]); // Clear current schedules
    await fetchSchedules(selectedStatus, true); // Pass true to show loading
  };
  
  // Close action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActionMenuOpen(null);
    };
    
    if (actionMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [actionMenuOpen]);
  
  // Reset form when modal closes
  useEffect(() => {
    if (!modalOpen) {
      form.resetFields();
      setEditingSchedule(null);
    }
  }, [modalOpen, form]);

  const fetchSchedules = async (status?: 'all' | 'active' | 'inactive', showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    
    try {
      const filterStatus = status || selectedStatus;
      const response = await scheduledReportsService.getSchedules({
        isActive: filterStatus === 'all' ? undefined : filterStatus === 'active'
      });
      
      console.log('Scheduled reports response:', response);
      
      if (response.success && ((response as any).data)) {
        // Update schedules
        setSchedules(((response as any).data).schedules);
        setLastRefresh(new Date());
        console.log('Updated schedules:', ((response as any).data).schedules);
      }
    } catch (error) {
      console.error('Error fetching scheduled reports:', error);
      // Only show error message if it's not a background refresh
      if (showLoading) {
        message.error('Failed to fetch scheduled reports');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const fetchTemplates = async () => {
    try {
      const [templatesRes, customRes] = await Promise.all([
        reportsService.getReportTemplates(),
        reportsService.getCustomReports({ includePublic: true })
      ]);
      
      if (templatesRes.success && templatesRes.data) {
        setTemplates(templatesRes.data.definitions || []);
      }
      if (customRes.success && customRes.data) {
        setCustomTemplates(customRes.data.reports || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const handleCreateSchedule = () => {
    setEditingSchedule(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEditSchedule = (scheduleId: string) => {
    // Find the fresh schedule from the current state
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) {
      message.error('Schedule not found');
      return;
    }
    
    console.log('Editing schedule:', schedule);
    setEditingSchedule(schedule);
    form.setFieldsValue({
      name: schedule.name,
      description: schedule.description,
      templateType: schedule.template_id ? 'template' : 'custom',
      templateId: schedule.template_id,
      customTemplateId: schedule.custom_template_id,
      frequency: schedule.schedule_config.frequency,
      time: dayjs(schedule.schedule_config.time, 'HH:mm'),
      dayOfWeek: schedule.schedule_config.dayOfWeek,
      dayOfMonth: schedule.schedule_config.dayOfMonth,
      recipients: schedule.recipients?.join(', '),
      exportFormat: schedule.export_format,
      isActive: schedule.is_active
    });
    setModalOpen(true);
    setActionMenuOpen(null);
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    console.log('Deleting schedule:', scheduleId);
    setActionMenuOpen(null);
    
    // Use setTimeout to ensure menu closes before modal opens
    setTimeout(() => {
      Modal.confirm({
        title: 'Delete Scheduled Report',
        content: 'Are you sure you want to delete this scheduled report? This action cannot be undone.',
        okText: 'Delete',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: async () => {
          try {
            console.log('Confirming delete for schedule:', scheduleId);
            const response = await scheduledReportsService.deleteSchedule(scheduleId);
            console.log('Delete response:', response);
            
            message.success('Scheduled report deleted');
            // Clear schedules first to force UI update
            setSchedules([]);
            // Fetch schedules with current filter
            await fetchSchedules(selectedStatus);
          } catch (error: unknown) {
            console.error('Delete error:', error);
            // If it's a 404, the item was already deleted, so we should still refresh
            if (((error as any)?.message || String(error)) && ((error as any)?.message || String(error)).includes('404')) {
              console.log('Schedule already deleted, refreshing list');
              message.success('Scheduled report deleted');
              await fetchSchedules(selectedStatus);
            } else if (error.response && error.response.status === 404) {
              console.log('Schedule already deleted (404), refreshing list');
              message.success('Scheduled report deleted');
              await fetchSchedules(selectedStatus);
            } else {
              message.error('Failed to delete scheduled report');
            }
          }
        },
        onCancel: () => {
          console.log('Delete cancelled');
        }
      });
    }, 100);
  };

  const handleToggleSchedule = async (scheduleId: string) => {
    try {
      await scheduledReportsService.toggleSchedule(scheduleId);
      message.success('Schedule status updated');
      fetchSchedules();
    } catch (error) {
      message.error('Failed to update schedule status');
    }
    setActionMenuOpen(null);
  };

  const handleViewHistory = async (scheduleId: string) => {
    setSelectedScheduleId(scheduleId);
    setHistoryModalOpen(true);
    setActionMenuOpen(null);
    
    try {
      const response = await scheduledReportsService.getScheduleHistory(scheduleId);
      if (response.success && ((response as any).data)) {
        setScheduleHistory(((response as any).data).executions);
      }
    } catch (error) {
      message.error('Failed to fetch execution history');
    }
  };

  const handleRunNow = async (schedule: ReportSchedule) => {
    setActionMenuOpen(null);
    try {
      console.log('Running scheduled report:', schedule);
      if (schedule.template_id) {
        await reportsService.executeReport(schedule.template_id, schedule.parameters || {});
      } else if (schedule.custom_template_id) {
        await reportsService.executeCustomReport(schedule.custom_template_id, schedule.parameters || {});
      }
      message.success('Report execution started');
    } catch (error) {
      console.error('Failed to execute report:', error);
      message.error('Failed to execute report');
    }
  };

  const handleSubmit = async (values: any) => {
    console.log('Form values:', values);
    try {
      const scheduleConfig: ScheduleConfig = {
        frequency: values.frequency,
        time: values.time.format('HH:mm'),
        ...(values.frequency === 'weekly' && { dayOfWeek: values.dayOfWeek }),
        ...(values.frequency === 'monthly' && { dayOfMonth: values.dayOfMonth })
      };

      if (editingSchedule) {
        const updateData: UpdateScheduleDto = {
          name: values.name,
          description: values.description,
          scheduleConfig,
          // Only include recipients if user has provided a non-empty string (after trimming)
          recipients: values.recipients && values.recipients.trim().length > 0 ?
            values.recipients.split(',').map((e: string) => e.trim()).filter(Boolean) : undefined,
          exportFormat: values.exportFormat,
          isActive: values.isActive,
          // Pass through the (possibly updated) template association
          ...(values.templateType === 'template' ?
            { templateId: values.templateId, customTemplateId: undefined } :
            values.templateType === 'custom' ? { customTemplateId: values.customTemplateId, templateId: undefined } : {})
        };
        
        console.log('Updating schedule with data:', updateData);
        console.log('Editing schedule ID:', editingSchedule.id);
        
        const response = await scheduledReportsService.updateSchedule(editingSchedule.id, updateData);
        console.log('Update response:', response);
        
        if (response.success) {
          message.success('Schedule updated successfully');
        } else {
          throw new Error(response.error || 'Update failed');
        }
      } else {
        const createData: CreateScheduleDto = {
          name: values.name,
          description: values.description,
          ...(values.templateType === 'template' ? 
            { templateId: values.templateId } : 
            { customTemplateId: values.customTemplateId }
          ),
          scheduleConfig,
          recipients: values.recipients ? values.recipients.split(',').map((e: string) => e.trim()).filter(Boolean) : [],
          exportFormat: values.exportFormat || 'excel'
        };
        
        console.log('Creating schedule with data:', createData);
        const createResponse = await scheduledReportsService.createSchedule(createData);
        console.log('Create response:', createResponse);
        message.success('Schedule created successfully');
      }

      // Close modal and reset form first
      setModalOpen(false);
      setEditingSchedule(null);
      form.resetFields();
      
      // Fetch schedules with current filter (don't change user's filter)
      await fetchSchedules(selectedStatus);
    } catch (error) {
      console.error('Submit error:', error);
      message.error(editingSchedule ? 'Failed to update schedule' : 'Failed to create schedule');
    }
  };

  const getStatusColor = (schedule: ReportSchedule) => {
    if (!schedule.is_active) return '#6b7280';
    if (schedule.last_run && new Date(schedule.last_run) > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
      return '#10b981';
    }
    return '#3b82f6';
  };

  const getStatusIcon = (schedule: ReportSchedule) => {
    if (!schedule.is_active) return <Power style={{ width: '16px', height: '16px' }} />;
    return <CheckCircle style={{ width: '16px', height: '16px' }} />;
  };

  const filteredSchedules = schedules.filter(schedule => {
    const matchesSearch = searchQuery === '' || 
      schedule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      schedule.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'active' && schedule.is_active) ||
      (selectedStatus === 'inactive' && !schedule.is_active);
    
    return matchesSearch && matchesStatus;
  });

  const daysOfWeek = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      position: 'relative' as const,
      overflow: 'hidden'
    }}>
      
      <div style={{ padding: '24px', position: 'relative' as const, zIndex: 1 }}>
        {/* Header */}
        <div style={{ maxWidth: '1200px', margin: '0 auto 32px' }}>
          <div style={{
            background: darkMode 
              ? 'rgba(30, 41, 59, 0.8)' 
              : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: darkMode 
              ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
              : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(255, 255, 255, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
                <h1 style={{ fontSize: '30px', fontWeight: 'bold', marginBottom: '8px', color: darkMode ? '#f1f5f9' : '#1e293b' }}>Scheduled Reports</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <p style={{ color: darkMode ? '#94a3b8' : '#64748b' }}>Automate your report generation and delivery</p>
                  <span style={{ 
                    fontSize: '12px', 
                    color: darkMode ? '#64748b' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Clock style={{ width: '12px', height: '12px' }} />
                    Last updated: {lastRefresh.toLocaleTimeString()}
                  </span>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={refreshSchedules}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: darkMode ? '#1f2937' : 'white',
                  color: darkMode ? '#d1d5db' : '#1e293b',
                  border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.3s ease',
                  opacity: loading ? 0.6 : 1
                }}
                title="Refresh schedules"
              >
                <svg 
                  style={{ 
                    width: '16px', 
                    height: '16px',
                    animation: loading ? 'spin 1s linear infinite' : 'none'
                  }} 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleCreateSchedule}
                className="btn-gradient"
                style={{
                  fontWeight: '600'
                }}
              >
                <Plus style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                Create Schedule
              </button>
            </div>
          </div>

            {/* Search and Filters */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, position: 'relative' as const }}>
                <Search style={{ position: 'absolute' as const, left: '12px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Search schedules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '40px',
                  paddingRight: '16px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  borderRadius: '8px',
                  border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                  background: darkMode ? '#1f2937' : 'white',
                  color: darkMode ? 'white' : '#1e293b',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
              />
            </div>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${filterOpen ? '#3b82f6' : darkMode ? '#374151' : '#e5e7eb'}`,
                background: filterOpen ? '#3b82f6' : darkMode ? '#1f2937' : 'white',
                color: filterOpen ? 'white' : darkMode ? '#d1d5db' : '#1e293b',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
                <Filter style={{ width: '16px', height: '16px' }} />
              Filters
            </button>
          </div>

            {/* Filter Options */}
            {filterOpen && (
              <div style={{ 
                marginTop: '16px', 
                padding: '16px', 
                borderRadius: '8px', 
                background: darkMode ? 'rgba(31, 41, 59, 0.5)' : '#f9fafb'
              }}>
              <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: darkMode ? '#d1d5db' : '#374151' }}>Status</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                  {['all', 'active', 'inactive'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setSelectedStatus(status as any)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        textTransform: 'capitalize' as const,
                        transition: 'all 0.3s ease',
                        background: selectedStatus === status 
                          ? '#3b82f6' 
                          : darkMode ? '#374151' : 'white',
                        color: selectedStatus === status 
                          ? 'white' 
                          : darkMode ? '#d1d5db' : '#374151',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

          {/* Schedules List */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px', position: 'relative' as const, overflow: 'visible' }}>
          {loading ? (
              <div style={{
                background: darkMode 
                  ? 'rgba(30, 41, 59, 0.8)' 
                  : 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(12px)',
                borderRadius: '12px',
                padding: '32px',
                textAlign: 'center' as const,
                boxShadow: darkMode 
                  ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(255, 255, 255, 0.5)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  border: '4px solid #3b82f6',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  margin: '0 auto',
                  animation: 'spin 1s linear infinite'
                }} />
                <p style={{ marginTop: '16px', color: darkMode ? '#94a3b8' : '#6b7280' }}>Loading schedules...</p>
            </div>
          ) : filteredSchedules.length === 0 ? (
              <div style={{
                background: darkMode 
                  ? 'rgba(30, 41, 59, 0.8)' 
                  : 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(12px)',
                borderRadius: '12px',
                padding: '32px',
                textAlign: 'center' as const,
                boxShadow: darkMode 
                  ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(255, 255, 255, 0.5)'
              }}>
                <Calendar style={{ width: '64px', height: '64px', margin: '0 auto 16px', color: '#9ca3af' }} />
                <p style={{ color: darkMode ? '#94a3b8' : '#6b7280', fontSize: '16px', fontWeight: '500' }}>No scheduled reports found</p>
                <p style={{ color: darkMode ? '#94a3b8' : '#6b7280', fontSize: '14px', marginTop: '8px' }}>
                  Click "Create Schedule" above to automate your report generation
                </p>
            </div>
          ) : (
            filteredSchedules.map((schedule) => (
                <div key={schedule.id} style={{
                  background: darkMode 
                    ? 'rgba(30, 41, 59, 0.8)' 
                    : 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: darkMode 
                    ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
                    : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                  border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(255, 255, 255, 0.5)',
                  transition: 'all 0.3s ease',
                  position: 'relative' as const,
                  overflow: 'visible',
                  // Elevate the card when its action menu is open so the dropdown sits above other cards
                  zIndex: actionMenuOpen === schedule.id ? 1500 : 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: darkMode ? '#f1f5f9' : '#1e293b' }}>{schedule.name}</h3>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: getStatusColor(schedule) }}>
                        {getStatusIcon(schedule)}
                        {schedule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    
                    {schedule.description && (
                        <p style={{ color: darkMode ? '#94a3b8' : '#6b7280', marginBottom: '12px' }}>{schedule.description}</p>
                    )}
                    
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '16px', fontSize: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                          <span style={{ color: darkMode ? '#d1d5db' : '#4b5563' }}>{scheduledReportsService.getScheduleDescription(schedule.schedule_config)}</span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileSpreadsheet style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                          <span style={{ color: darkMode ? '#d1d5db' : '#4b5563' }}>{schedule.template_name || schedule.custom_template_name}</span>
                        </div>
                      
                      {schedule.recipients && schedule.recipients.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Mail style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                            <span style={{ color: darkMode ? '#d1d5db' : '#4b5563' }}>{schedule.recipients.length} recipient{schedule.recipients.length > 1 ? 's' : ''}</span>
                          </div>
                      )}
                      
                      {schedule.next_run && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                            <span style={{ color: darkMode ? '#d1d5db' : '#4b5563' }}>Next: {scheduledReportsService.getNextRunDescription(schedule.next_run)}</span>
                          </div>
                      )}
                    </div>
                  </div>
                  
                    <div style={{ position: 'relative' as const }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenuOpen(actionMenuOpen === schedule.id ? null : schedule.id);
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <MoreVertical style={{ width: '20px', height: '20px', color: darkMode ? '#9ca3af' : '#6b7280' }} />
                    </button>
                    
                    {actionMenuOpen === schedule.id && (
                        <div style={{
                          position: 'absolute' as const,
                          right: 0,
                          marginTop: '8px',
                          width: '192px',
                          borderRadius: '8px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                          background: darkMode ? '#1f2937' : 'white',
                          border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                          zIndex: 1000
                        }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunNow(schedule);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left' as const,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: darkMode ? '#d1d5db' : '#374151'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                            <Play style={{ width: '16px', height: '16px' }} /> Run Now
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSchedule(schedule.id);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left' as const,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: darkMode ? '#d1d5db' : '#374151'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                            <Edit style={{ width: '16px', height: '16px' }} /> Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSchedule(schedule.id);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left' as const,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: darkMode ? '#d1d5db' : '#374151'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                            <Power style={{ width: '16px', height: '16px' }} /> {schedule.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewHistory(schedule.id);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left' as const,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: darkMode ? '#d1d5db' : '#374151'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = darkMode ? 'rgba(55, 65, 81, 0.5)' : '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                            <History style={{ width: '16px', height: '16px' }} /> View History
                        </button>
                          <hr style={{ margin: '4px 0', border: 'none', borderTop: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}` }} />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSchedule(schedule.id);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 16px',
                            textAlign: 'left' as const,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: '#dc2626'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = darkMode ? 'rgba(220, 38, 38, 0.1)' : '#fef2f2';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                            <Trash2 style={{ width: '16px', height: '16px' }} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      {/* Create/Edit Modal */}
      <Modal
        title={editingSchedule ? 'Edit Schedule' : 'Create Schedule'}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            frequency: 'daily',
            exportFormat: 'excel',
            isActive: true
          }}
        >
          <Form.Item
            name="name"
            label="Schedule Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="Monthly Sales Report" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Optional description" />
          </Form.Item>

          <Form.Item
            name="templateType"
            label="Report Type"
            rules={[{ required: true, message: 'Please select a report type' }]}
          >
            <Select placeholder="Select report type">
              <Option value="template">Pre-built Template</Option>
              <Option value="custom">Custom Report</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.templateType !== currentValues.templateType}
          >
            {({ getFieldValue }) => {
              const templateType = getFieldValue('templateType');
              if (templateType === 'template') {
                return (
                  <Form.Item
                    name="templateId"
                    label="Select Template"
                    rules={[{ required: true, message: 'Please select a template' }]}
                  >
                    <Select placeholder="Select a pre-built template">
                      {templates.map((template) => (
                        <Option key={template.id} value={template.id}>
                          {template.name} ({template.dataSource})
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              } else if (templateType === 'custom') {
                return (
                  <Form.Item
                    name="customTemplateId"
                    label="Select Custom Report"
                    rules={[{ required: true, message: 'Please select a custom report' }]}
                  >
                    <Select placeholder="Select a custom report">
                      {customTemplates.map((template) => (
                        <Option key={template.id} value={template.id}>
                          {template.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item
            name="frequency"
            label="Frequency"
            rules={[{ required: true, message: 'Please select frequency' }]}
          >
            <Select>
              <Option value="daily">Daily</Option>
              <Option value="weekly">Weekly</Option>
              <Option value="monthly">Monthly</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="time"
            label="Time"
            rules={[{ required: true, message: 'Please select time' }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.frequency !== currentValues.frequency}
          >
            {({ getFieldValue }) => {
              const frequency = getFieldValue('frequency');
              if (frequency === 'weekly') {
                return (
                  <Form.Item
                    name="dayOfWeek"
                    label="Day of Week"
                    rules={[{ required: true, message: 'Please select day' }]}
                  >
                    <Select placeholder="Select day">
                      {daysOfWeek.map((day) => (
                        <Option key={day.value} value={day.value}>
                          {day.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              } else if (frequency === 'monthly') {
                return (
                  <Form.Item
                    name="dayOfMonth"
                    label="Day of Month"
                    rules={[{ required: true, message: 'Please enter day' }]}
                  >
                    <InputNumber min={1} max={31} placeholder="1-31" style={{ width: '100%' }} />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item name="recipients" label="Email Recipients">
            <Input placeholder="email1@example.com, email2@example.com" />
          </Form.Item>

          <Form.Item name="exportFormat" label="Export Format">
            <Select>
              <Option value="excel">Excel</Option>
              <Option value="csv">CSV</Option>
              <Option value="pdf">PDF</Option>
            </Select>
          </Form.Item>

          {editingSchedule && (
            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* History Modal */}
      <Modal
        title="Execution History"
        open={historyModalOpen}
        onCancel={() => setHistoryModalOpen(false)}
        footer={null}
        width={800}
      >
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
          {scheduleHistory.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '32px 0', color: darkMode ? '#94a3b8' : '#6b7280' }}>
              No execution history available
            </div>
          ) : (
            scheduleHistory.map((execution) => (
              <div key={execution.id} style={{ 
                padding: '16px', 
                border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, 
                borderRadius: '8px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>{execution.report_name}</span>
                      <span style={{ 
                        fontSize: '14px', 
                        color: execution.status === 'completed' ? '#10b981' :
                               execution.status === 'failed' ? '#ef4444' :
                               execution.status === 'running' ? '#3b82f6' :
                               '#6b7280'
                      }}>
                        {execution.status === 'completed' && <CheckCircle style={{ width: '16px', height: '16px', display: 'inline', marginRight: '4px' }} />}
                        {execution.status === 'failed' && <AlertCircle style={{ width: '16px', height: '16px', display: 'inline', marginRight: '4px' }} />}
                        {execution.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', color: darkMode ? '#94a3b8' : '#6b7280', marginTop: '4px' }}>
                      {formatDate(execution.started_at)}
                      {execution.row_count && ` • ${execution.row_count} rows`}
                      {execution.execution_time_ms && ` • ${execution.execution_time_ms}ms`}
                    </div>
                    {execution.error_message && (
                      <div style={{ fontSize: '14px', color: '#ef4444', marginTop: '4px' }}>
                        {execution.error_message}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
        </div>
      </div>
    </div>
  );
};

export default ScheduledReportsPage;