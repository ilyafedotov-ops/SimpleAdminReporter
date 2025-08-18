/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Typography, 
  Card, 
  Tabs, 
  Button, 
  Space, 
  Alert,
  Row,
  Col,
  Statistic,
  message,
  Spin,
  Form,
  Input,
  Switch,
  Select,
  Divider,
  Avatar,
  Tag,
  TimePicker,
  Checkbox
} from 'antd';
import dayjs from 'dayjs';
import { 
  PlusOutlined, 
  KeyOutlined, 
  CloudServerOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  SecurityScanOutlined,
  SaveOutlined,
  LockOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '@/store';
import { setBreadcrumbs, setCurrentPage, selectTheme } from '@/store/slices/uiSlice';
import { ServiceCredential, CreateCredentialDto, UpdateCredentialDto } from '@/types';
import { credentialsApi } from '@/services/credentials.api';
import { activeAuthService as authService } from '@/services/authService.factory';
import { userPreferencesApi } from '@/services/userPreferences.api';
import apiService from '@/services/api';
import CredentialList from '@/components/credentials/CredentialList';
import CredentialForm from '@/components/credentials/CredentialForm';

const { Text } = Typography;
const { TabPane } = Tabs;

const SettingsPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const { user } = useAppSelector(state => state.auth);
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;
  
  // Get tab from URL parameter, default to 'general'
  const tabFromUrl = searchParams.get('tab') || 'general';
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [credentials, setCredentials] = useState<ServiceCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingCredential, setEditingCredential] = useState<ServiceCredential | null>(null);
  const [savingCredential, setSavingCredential] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationPreferencesLoaded, setNotificationPreferencesLoaded] = useState(false);
  const [systemConfig, setSystemConfig] = useState<any>(null);
  const [systemConfigLoading, setSystemConfigLoading] = useState(false);
  const [systemConfigAttempted, setSystemConfigAttempted] = useState(false);
  const [systemConfigError, setSystemConfigError] = useState<string | null>(null);
  
  const [generalSettings, setGeneralSettings] = useState({
    theme: 'light',
    defaultExportFormat: 'excel',
    timezone: 'UTC',
    autoRefresh: true,
    pageSize: 50
  });
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    reportCompletion: true,
    scheduledReports: true,
    systemAlerts: false,
    weeklyDigest: true,
    notificationTime: '09:00'
  });
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'settings', title: 'Settings' }));
    dispatch(setBreadcrumbs([
      { title: 'Dashboard', path: '/dashboard' },
      { title: 'Settings' }
    ]));
  }, [dispatch]);

  // Update active tab when URL parameter changes
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && ['general', 'profile', 'notifications', 'credentials', 'system'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
      // Reset loaded flag when switching away from notifications
      if (tabFromUrl !== 'notifications') {
        setNotificationPreferencesLoaded(false);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'credentials') {
      loadCredentials();
    } else if (activeTab === 'profile' && user) {
      loadUserProfile();
    } else if (activeTab === 'notifications' && !notificationPreferencesLoaded) {
      loadNotificationPreferences();
    } else if (activeTab === 'system' && user) {
      loadSystemConfig();
    }
  }, [activeTab, user, notificationPreferencesLoaded]);

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const response = await authService.getProfile();
      if (response.success && ((response as any).data)) {
        profileForm.setFieldsValue({
          displayName: ((response as any).data).displayName,
          email: ((response as any).data).email,
          username: ((response as any).data).username
        });
      }
    } catch (error: any) {
      message.error('Failed to load profile data');
    }
  };

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const response = await credentialsApi.getCredentials();
      setCredentials(((response as any).data) || []);
    } catch (error: any) {
      message.error(((error as any)?.message || String(error)) || 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  const loadNotificationPreferences = async () => {
    try {
      const prefs = await userPreferencesApi.getNotificationPreferences();
      
      setNotificationSettings({
        emailNotifications: prefs.emailNotifications ?? true,
        reportCompletion: prefs.notificationPreferences?.reportCompletion ?? true,
        scheduledReports: prefs.notificationPreferences?.scheduledReports ?? true,
        systemAlerts: prefs.notificationPreferences?.systemAlerts ?? false,
        weeklyDigest: prefs.notificationPreferences?.weeklyDigest ?? true,
        notificationTime: prefs.notificationPreferences?.notificationTime ?? '09:00'
      });
      setNotificationPreferencesLoaded(true);
    } catch (error: any) {
      // Set default values on error
      setNotificationSettings({
        emailNotifications: true,
        reportCompletion: true,
        scheduledReports: true,
        systemAlerts: false,
        weeklyDigest: true,
        notificationTime: '09:00'
      });
      setNotificationPreferencesLoaded(true);
      // Only show error for actual failures, not missing preferences
      if (((error as any)?.message || String(error)) && !((error as any)?.message || String(error)).includes('Invalid response structure') && !((error as any)?.message || String(error)).includes('preferences not found')) {
        message.error('Failed to load notification preferences');
      }
    }
  };

  const saveNotificationPreferences = async () => {
    setSavingNotifications(true);
    try {
      const updatedPrefs = await userPreferencesApi.updateNotificationPreferences({
        emailNotifications: notificationSettings.emailNotifications,
        reportCompletion: notificationSettings.reportCompletion,
        scheduledReports: notificationSettings.scheduledReports,
        systemAlerts: notificationSettings.systemAlerts,
        weeklyDigest: notificationSettings.weeklyDigest,
        notificationTime: notificationSettings.notificationTime
      });
      message.success('Notification preferences saved successfully');
      // Update state with the returned data to ensure consistency
      if (updatedPrefs && updatedPrefs.notificationPreferences) {
        setNotificationSettings({
          emailNotifications: updatedPrefs.emailNotifications,
          reportCompletion: updatedPrefs.notificationPreferences.reportCompletion,
          scheduledReports: updatedPrefs.notificationPreferences.scheduledReports,
          systemAlerts: updatedPrefs.notificationPreferences.systemAlerts,
          weeklyDigest: updatedPrefs.notificationPreferences.weeklyDigest,
          notificationTime: updatedPrefs.notificationPreferences.notificationTime
        });
      }
      // Force reload of preferences to ensure we have latest data
      await loadNotificationPreferences();
    } catch (error: any) {
      message.error('Failed to save notification preferences');
    } finally {
      setSavingNotifications(false);
    }
  };

  const loadSystemConfig = async () => {
    if (!user) {
      console.log('DEBUG: No user found, skipping system config load');
      return;
    }
    
    setSystemConfigLoading(true);
    setSystemConfigAttempted(true);
    setSystemConfigError(null); // Clear previous errors
    try {
      // Debug: Check if token exists
      const token = localStorage.getItem('accessToken');
      console.log('DEBUG: JWT token exists:', !!token);
      console.log('DEBUG: Token value (first 20 chars):', token ? token.substring(0, 20) + '...' : 'none');
      console.log('DEBUG: User admin status:', user.isAdmin);
      console.log('DEBUG: Making system config API call to:', '/system/config');
      
      // Test a working API call first for comparison
      console.log('DEBUG: Testing notifications API call first...');
      try {
        const testResponse = await apiService.get('/notifications/stats');
        console.log('DEBUG: Notifications API works:', testResponse.status);
      } catch (testError: any) {
        console.error('DEBUG: Notifications API also fails:', testError.response?.status, testError.message);
      }
      
      const response = await apiService.get('/system/config');
      console.log('DEBUG: System config API success:', response);
      setSystemConfig(response);
      setSystemConfigError(null); // Clear any previous errors on success
    } catch (error: any) {
      console.error('DEBUG: System config API error:', error);
      console.error('DEBUG: Error response:', error.response);
      console.error('DEBUG: Error config:', ((error as any)?.config));
      
      let errorMessage = 'Failed to load system configuration';
      if (error.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in to access system configuration.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Administrator privileges required. Contact your system administrator.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error occurred while loading system configuration.';
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timeout while loading system configuration. Please try again.';
      } else if (!error.response) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (((error as any)?.message || String(error))) {
        errorMessage = ((error as any)?.message || String(error));
      }
      
      setSystemConfigError(errorMessage);
      message.error(errorMessage);
      console.error('Load system config error:', error);
    } finally {
      setSystemConfigLoading(false);
    }
  };


  

  const handleAddCredential = () => {
    setEditingCredential(null);
    setFormVisible(true);
  };

  const handleEditCredential = (credential: ServiceCredential) => {
    setEditingCredential(credential);
    setFormVisible(true);
  };

  const handleFormCancel = () => {
    setFormVisible(false);
    setEditingCredential(null);
  };

  const handleFormSubmit = async (values: CreateCredentialDto | UpdateCredentialDto) => {
    setSavingCredential(true);
    try {
      if (editingCredential) {
        // Update existing credential
        await credentialsApi.updateCredential(editingCredential.id, values as UpdateCredentialDto);
        message.success('Credential updated successfully');
      } else {
        // Create new credential
        await credentialsApi.createCredential(values as CreateCredentialDto);
        message.success('Credential created successfully');
      }
      setFormVisible(false);
      setEditingCredential(null);
      loadCredentials();
    } catch (error: any) {
      message.error(((error as any)?.message || String(error)) || 'Failed to save credential');
    } finally {
      setSavingCredential(false);
    }
  };

  const getCredentialStats = () => {
    const total = credentials.length;
    const active = credentials.filter(c => c.isActive).length;
    const tested = credentials.filter(c => c.lastTested).length;
    const successful = credentials.filter(c => c.lastTestSuccess).length;

    return { total, active, tested, successful };
  };

  const stats = getCredentialStats();

  const renderCredentialsTab = () => (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Credentials"
              value={stats.total}
              prefix={<KeyOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active"
              value={stats.active}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Tested"
              value={stats.tested}
              prefix={<SecurityScanOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Successful"
              value={stats.successful}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: stats.successful === stats.tested ? '#3f8600' : '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        title={
          <Space>
            <CloudServerOutlined />
            Service Credentials
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadCredentials}
              loading={loading}
            >
              Refresh
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddCredential}
            >
              Add Credential
            </Button>
          </Space>
        }
      >
        <Alert
          message="Service Credentials"
          description="Configure credentials for connecting to Active Directory, Azure AD, and Office 365 services. Each service can have multiple credentials with one set as default."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <CredentialList
          credentials={credentials}
          loading={loading}
          onEdit={handleEditCredential}
          onRefresh={loadCredentials}
        />
      </Card>

      <CredentialForm
        visible={formVisible}
        credential={editingCredential}
        onCancel={handleFormCancel}
        onSubmit={handleFormSubmit}
        loading={savingCredential}
      />
    </div>
  );

  const renderGeneralTab = () => (
    <div>
      <Card title="General Settings">
        <Form layout="vertical">
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item label="Theme Preference">
              <Select
                value={generalSettings.theme}
                onChange={(value) => setGeneralSettings({...generalSettings, theme: value})}
                options={[
                  { label: 'Light Theme', value: 'light' },
                  { label: 'Dark Theme', value: 'dark' },
                  { label: 'System Default', value: 'system' }
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Default Export Format">
              <Select
                value={generalSettings.defaultExportFormat}
                onChange={(value) => setGeneralSettings({...generalSettings, defaultExportFormat: value})}
                options={[
                  { label: 'Excel (.xlsx)', value: 'excel' },
                  { label: 'CSV (.csv)', value: 'csv' },
                  { label: 'PDF (.pdf)', value: 'pdf' },
                  { label: 'JSON (.json)', value: 'json' }
                ]}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item label="Timezone">
              <Select
                value={generalSettings.timezone}
                onChange={(value) => setGeneralSettings({...generalSettings, timezone: value})}
                showSearch
                options={[
                  { label: 'UTC', value: 'UTC' },
                  { label: 'Eastern Time (ET)', value: 'America/New_York' },
                  { label: 'Central Time (CT)', value: 'America/Chicago' },
                  { label: 'Mountain Time (MT)', value: 'America/Denver' },
                  { label: 'Pacific Time (PT)', value: 'America/Los_Angeles' },
                  { label: 'London (GMT)', value: 'Europe/London' },
                  { label: 'Berlin (CET)', value: 'Europe/Berlin' }
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Default Page Size">
              <Select
                value={generalSettings.pageSize}
                onChange={(value) => setGeneralSettings({...generalSettings, pageSize: value})}
                options={[
                  { label: '25 rows', value: 25 },
                  { label: '50 rows', value: 50 },
                  { label: '100 rows', value: 100 },
                  { label: '250 rows', value: 250 }
                ]}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item>
          <Checkbox
            checked={generalSettings.autoRefresh}
            onChange={(e) => setGeneralSettings({...generalSettings, autoRefresh: e.target.checked})}
          >
            Auto-refresh dashboard data every 5 minutes
          </Checkbox>
        </Form.Item>
        <Divider />
        <Form.Item>
          <Button type="primary" icon={<SaveOutlined />}>
            Save General Settings
          </Button>
        </Form.Item>
      </Form>
    </Card>
    </div>
  );

  const handleProfileUpdate = async (values: any) => {
    setProfileLoading(true);
    try {
      const response = await authService.updateProfile(values);
      if (response.success) {
        message.success('Profile updated successfully');
      }
    } catch (error: any) {
      message.error(((error as any)?.message || String(error)) || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (values: any) => {
    try {
      const response = await authService.changePassword(values.currentPassword, values.newPassword);
      if (response.success) {
        message.success('Password changed successfully');
        passwordForm.resetFields();
      }
    } catch (error: any) {
      message.error(((error as any)?.message || String(error)) || 'Failed to change password');
    }
  };

  const renderProfileTab = () => (
    <div>
      <Row gutter={24}>
        <Col span={16}>
          <Card title="Profile Information">
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={handleProfileUpdate}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Display Name"
                    name="displayName"
                    rules={[{ required: true, message: 'Please enter display name' }]}
                  >
                    <Input placeholder="Enter display name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Email"
                    name="email"
                    rules={[
                      { required: true, message: 'Please enter email' },
                      { type: 'email', message: 'Please enter valid email' }
                    ]}
                  >
                    <Input placeholder="Enter email address" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="Username"
                name="username"
              >
                <Input disabled placeholder="Username (read-only)" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={profileLoading} icon={<SaveOutlined />}>
                  Update Profile
                </Button>
              </Form.Item>
            </Form>
          </Card>

          {user?.authSource === 'local' && (
            <Card title="Change Password" style={{ marginTop: 16 }}>
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={handlePasswordChange}
              >
                <Form.Item
                  label="Current Password"
                  name="currentPassword"
                  rules={[{ required: true, message: 'Please enter current password' }]}
                >
                  <Input.Password placeholder="Enter current password" />
                </Form.Item>
                <Form.Item
                  label="New Password"
                  name="newPassword"
                  rules={[
                    { required: true, message: 'Please enter new password' },
                    { min: 6, message: 'Password must be at least 6 characters' }
                  ]}
                >
                  <Input.Password placeholder="Enter new password" />
                </Form.Item>
                <Form.Item
                  label="Confirm New Password"
                  name="confirmPassword"
                  rules={[
                    { required: true, message: 'Please confirm new password' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Passwords do not match'));
                      },
                    })
                  ]}
                >
                  <Input.Password placeholder="Confirm new password" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" icon={<LockOutlined />}>
                    Change Password
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          )}
        </Col>
        <Col span={8}>
          <Card title="Account Information">
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Avatar size={80} icon={<UserOutlined />} />
              <div style={{ marginTop: 12 }}>
                <Text strong>{user?.displayName}</Text>
                <br />
                <Text type="secondary">{user?.email}</Text>
              </div>
            </div>
            <Divider />
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text type="secondary">Authentication Source:</Text>
                <br />
                <Tag color={user?.authSource === 'ad' ? 'blue' : user?.authSource === 'azure' ? 'cyan' : 'green'}>
                  {user?.authSource === 'ad' ? 'Active Directory' :
                   user?.authSource === 'azure' ? 'Azure AD' : 'Local Account'}
                </Tag>
              </div>
              <div>
                <Text type="secondary">Roles:</Text>
                <br />
                {user?.roles?.map(role => (
                  <Tag key={role} color="#4b5563">{role}</Tag>
                ))}
              </div>
              <div>
                <Text type="secondary">Last Login:</Text>
                <br />
                <Text>{user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</Text>
              </div>
              <div>
                <Text type="secondary">Account Status:</Text>
                <br />
                <Tag color={user?.isActive ? 'green' : 'red'}>
                  {user?.isActive ? 'Active' : 'Inactive'}
                </Tag>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );


  const renderNotificationsTab = () => (
    <Card title="Notification Preferences">
      <Form layout="vertical">
        <Alert
          message="Email Notifications"
          description="Configure when you receive email notifications from the system."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item label="Email Notifications">
              <Switch
                checked={notificationSettings.emailNotifications}
                onChange={(checked) => setNotificationSettings({...notificationSettings, emailNotifications: checked})}
                checkedChildren="Enabled"
                unCheckedChildren="Disabled"
              />
              <div style={{ fontSize: '12px', color: '#999', marginTop: 4 }}>
                Master switch for all email notifications
              </div>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Notification Time">
              <TimePicker
                format="HH:mm"
                value={notificationSettings.notificationTime ? dayjs(notificationSettings.notificationTime, 'HH:mm') : null}
                disabled={!notificationSettings.emailNotifications}
                onChange={(time) => setNotificationSettings({...notificationSettings, 
                  notificationTime: time ? time.format('HH:mm') : '09:00'})}
              />
              <div style={{ fontSize: '12px', color: '#999', marginTop: 4 }}>
                Preferred time for daily digest emails
              </div>
            </Form.Item>
          </Col>
        </Row>

        <Divider>Notification Types</Divider>

        <Row gutter={16}>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Switch
                  checked={notificationSettings.reportCompletion}
                  onChange={(checked) => setNotificationSettings({...notificationSettings, reportCompletion: checked})}
                  disabled={!notificationSettings.emailNotifications}
                />
                <Text style={{ marginLeft: 12 }}>Report Completion</Text>
                <div style={{ fontSize: '12px', color: '#999', marginLeft: 34 }}>
                  Notify when reports finish generating
                </div>
              </div>
              
              <div>
                <Switch
                  checked={notificationSettings.scheduledReports}
                  onChange={(checked) => setNotificationSettings({...notificationSettings, scheduledReports: checked})}
                  disabled={!notificationSettings.emailNotifications}
                />
                <Text style={{ marginLeft: 12 }}>Scheduled Reports</Text>
                <div style={{ fontSize: '12px', color: '#999', marginLeft: 34 }}>
                  Delivery notifications for scheduled reports
                </div>
              </div>
            </Space>
          </Col>
          
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Switch
                  checked={notificationSettings.systemAlerts}
                  onChange={(checked) => setNotificationSettings({...notificationSettings, systemAlerts: checked})}
                  disabled={!notificationSettings.emailNotifications}
                />
                <Text style={{ marginLeft: 12 }}>System Alerts</Text>
                <div style={{ fontSize: '12px', color: '#999', marginLeft: 34 }}>
                  Important system maintenance and alerts
                </div>
              </div>
              
              <div>
                <Switch
                  checked={notificationSettings.weeklyDigest}
                  onChange={(checked) => setNotificationSettings({...notificationSettings, weeklyDigest: checked})}
                  disabled={!notificationSettings.emailNotifications}
                />
                <Text style={{ marginLeft: 12 }}>Weekly Digest</Text>
                <div style={{ fontSize: '12px', color: '#999', marginLeft: 34 }}>
                  Weekly summary of your report activity
                </div>
              </div>
            </Space>
          </Col>
        </Row>

        <Divider />
        
        <Form.Item>
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={saveNotificationPreferences}
            loading={savingNotifications}
          >
            Save Notification Settings
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );

  const renderSystemTab = () => {
    // Check user authentication and admin status first
    if (!user) {
      return (
        <Card title="System Configuration">
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <UserOutlined style={{ fontSize: '48px', color: '#ff4d4f', marginBottom: 16 }} />
            <div style={{ fontSize: '18px', marginBottom: 8 }}>Authentication Required</div>
            <div style={{ color: '#666', marginBottom: 24 }}>
              Please log in to access system configuration.
            </div>
          </div>
        </Card>
      );
    }

    // Check if user has admin privileges
    if (!user.isAdmin) {
      return (
        <Card title="System Configuration">
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <LockOutlined style={{ fontSize: '48px', color: '#ff4d4f', marginBottom: 16 }} />
            <div style={{ fontSize: '18px', marginBottom: 8 }}>Access Restricted</div>
            <div style={{ color: '#666', marginBottom: 24 }}>
              System configuration requires administrator privileges.<br />
              Please contact your system administrator if you need access.
            </div>
          </div>
        </Card>
      );
    }

    // User is authenticated and is admin - show the interface
    // Handle loading states
    if (systemConfigLoading) {
      return (
        <Card title="System Configuration">
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Loading system configuration...</div>
          </div>
        </Card>
      );
    }

    // Admin user - always show the interface
    // Create fallback data if API call failed
    const displayConfig = systemConfig || {
      availability: {
        database: false,
        redis: false,
        ad: false,
        azure: false,
        o365: false
      },
      environment: 'Unknown',
      version: '1.0.0',
      uptime: 'Unknown',
      jwtConfigured: false,
      rateLimiting: false,
      mockData: false,
      errors: [],
      warnings: systemConfigAttempted && !systemConfig ? ['Unable to load system configuration - showing defaults'] : []
    };

    return (
      <div>
        <Alert
          message="System Configuration"
          description="Manage global system settings and service configurations. Changes here affect all users and require administrator privileges."
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />

        {!systemConfig && systemConfigAttempted && (
          <Alert
            message="Configuration Load Warning"
            description={systemConfigError ? 
              `Unable to load live system configuration: ${systemConfigError}. Showing default values. Click 'Refresh Configuration' to retry.` :
              "Unable to load live system configuration. Showing default values. Click 'Refresh Configuration' to retry."
            }
            type="warning"
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Card title="System Overview">
          <Row gutter={24}>
            <Col span={8}>
              <Card size="small" title="Application">
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Environment: </Text>
                  <Tag color={displayConfig?.environment === 'production' ? 'red' : displayConfig?.environment === 'development' ? 'blue' : 'default'}>
                    {displayConfig?.environment || 'Unknown'}
                  </Tag>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Version: </Text>
                  <Text code>{displayConfig?.version || '1.0.0'}</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Uptime: </Text>
                  <Text>{displayConfig?.uptime || 'Unknown'}</Text>
                </div>
                <div>
                  <Text strong>JWT Status: </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <LockOutlined style={{ color: displayConfig?.jwtConfigured ? '#52c41a' : '#ff4d4f', fontSize: 12 }} />
                    <Text style={{ fontSize: 12 }}>{displayConfig?.jwtConfigured ? 'Configured' : 'Not Configured'}</Text>
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title="Security">
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Rate Limiting: </Text>
                  <Switch 
                    size="small" 
                    checked={displayConfig?.rateLimiting || false} 
                    disabled 
                  />
                  <Text style={{ fontSize: 12, marginLeft: 8 }}>Enabled</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Mock Data: </Text>
                  <Switch 
                    size="small" 
                    checked={displayConfig?.mockData || false} 
                    disabled 
                  />
                  <Text style={{ fontSize: 12, marginLeft: 8 }}>{displayConfig?.mockData ? 'Active' : 'Inactive'}</Text>
                </div>
                <div>
                  <Text strong>Errors: </Text>
                  <Tag color={displayConfig?.errors?.length > 0 ? 'error' : 'success'}>
                    {displayConfig?.errors?.length || 0}
                  </Tag>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text strong>Warnings: </Text>
                  <Tag color={displayConfig?.warnings?.length > 0 ? 'warning' : 'success'}>
                    {displayConfig?.warnings?.length || 0}
                  </Tag>
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title="System Status">
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Database: </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <CheckCircleOutlined style={{ color: displayConfig?.availability?.database ? '#52c41a' : '#ff4d4f', fontSize: 12 }} />
                    <Text style={{ fontSize: 12 }}>{displayConfig?.availability?.database ? 'Connected' : 'Disconnected'}</Text>
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Redis: </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <CheckCircleOutlined style={{ color: displayConfig?.availability?.redis ? '#52c41a' : '#ff4d4f', fontSize: 12 }} />
                    <Text style={{ fontSize: 12 }}>{displayConfig?.availability?.redis ? 'Connected' : 'Disconnected'}</Text>
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>Active Directory: </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    {displayConfig?.availability?.ad ? (
                      <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                    ) : (
                      <LockOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                    )}
                    <Text style={{ fontSize: 12 }}>
                      {displayConfig?.availability?.ad ? 'Available' : 'Not Configured'}
                    </Text>
                  </div>
                </div>
                <div>
                  <Text strong>Azure AD/O365: </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    {displayConfig?.availability?.azure ? (
                      <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                    ) : (
                      <LockOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                    )}
                    <Text style={{ fontSize: 12 }}>
                      {displayConfig?.availability?.azure ? 'Available' : 'Not Configured'}
                    </Text>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Card>

        {displayConfig?.errors?.length > 0 && (
          <Card title="Configuration Errors" size="small" style={{ marginTop: 16 }}>
            {displayConfig.errors.map((error: string, index: number) => (
              <div key={index} style={{ marginBottom: 8, padding: 8, backgroundColor: '#fff2f0', borderRadius: 4 }}>
                <Text type="danger">• {error}</Text>
              </div>
            ))}
          </Card>
        )}

        {displayConfig?.warnings?.length > 0 && (
          <Card title="Configuration Warnings" size="small" style={{ marginTop: 16 }}>
            {displayConfig.warnings.map((warning: string, index: number) => (
              <div key={index} style={{ marginBottom: 8, padding: 8, backgroundColor: '#fffbe6', borderRadius: 4 }}>
                <Text type="warning">• {warning}</Text>
              </div>
            ))}
          </Card>
        )}

        <Card title="Detailed Configuration" style={{ marginTop: 16 }}>
          <Tabs defaultActiveKey="1">
            <Tabs.TabPane tab="Application" key="1">
              <div style={{ padding: 16 }}>
                <h4>Server Configuration</h4>
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Port: </Text>
                  <Text code>{displayConfig?.services?.database?.port || '5000'}</Text>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text strong>CORS Origins: </Text>
                  <div style={{ marginTop: 4 }}>
                    {displayConfig?.corsOrigins?.map((origin: string, index: number) => (
                      <Tag key={index} style={{ marginBottom: 4 }}>{origin}</Tag>
                    ))}
                  </div>
                </div>
                <h4 style={{ marginTop: 16 }}>Logging</h4>
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Log Level: </Text>
                  <Tag>{displayConfig?.app?.logging?.level || 'info'}</Tag>
                </div>
                <div>
                  <Text strong>Log Format: </Text>
                  <Text code>{displayConfig?.app?.logging?.format || 'combined'}</Text>
                </div>
              </div>
            </Tabs.TabPane>
            
            <Tabs.TabPane tab="Database" key="2">
              <div style={{ padding: 16 }}>
                {displayConfig?.services?.database && (
                  <>
                    <h4>Connection</h4>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Host: </Text>
                      <Text code>{displayConfig.services.database.host}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Database: </Text>
                      <Text code>{displayConfig.services.database.database}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Username: </Text>
                      <Text code>{displayConfig?.database?.username || 'postgres'}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Port: </Text>
                      <Text code>{displayConfig?.database?.port || '5432'}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>SSL: </Text>
                      <Switch size="small" checked={displayConfig?.database?.ssl || false} disabled />
                      <Text style={{ fontSize: 12, marginLeft: 8 }}>
                        {displayConfig?.database?.ssl ? 'Enabled' : 'Disabled'}
                      </Text>
                    </div>
                    <h4 style={{ marginTop: 16 }}>Performance</h4>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Max Connections: </Text>
                      <Text code>{displayConfig?.database?.maxConnections || '20'}</Text>
                    </div>
                    <div>
                      <Text strong>Connection Timeout: </Text>
                      <Text code>{displayConfig?.database?.connectionTimeoutMillis || '30000'}ms</Text>
                    </div>
                  </>
                )}
              </div>
            </Tabs.TabPane>
            
            <Tabs.TabPane tab="Redis" key="3">
              <div style={{ padding: 16 }}>
                {displayConfig?.services?.redis && (
                  <>
                    <h4>Connection</h4>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Host: </Text>
                      <Text code>{displayConfig.services.redis.host}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Port: </Text>
                      <Text code>{displayConfig?.redis?.port || '6379'}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Database: </Text>
                      <Text code>{displayConfig?.redis?.database || '0'}</Text>
                    </div>
                    <h4 style={{ marginTop: 16 }}>Reliability</h4>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Max Retries: </Text>
                      <Text code>{displayConfig?.redis?.maxRetriesPerRequest || '3'}</Text>
                    </div>
                    <div>
                      <Text strong>Retry Delay: </Text>
                      <Text code>{displayConfig?.redis?.retryDelayOnFailover || '100'}ms</Text>
                    </div>
                  </>
                )}
              </div>
            </Tabs.TabPane>
            
            <Tabs.TabPane tab="Services" key="4">
              <div style={{ padding: 16 }}>
                <h4>Active Directory</h4>
                {displayConfig?.services?.ad ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Server: </Text>
                      <Text code>{displayConfig.services.ad.server}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Base DN: </Text>
                      <Text code>{displayConfig?.ad?.baseDN || 'Not available'}</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Username: </Text>
                      <Text code>{displayConfig?.ad?.username || 'Not available'}</Text>
                    </div>
                    <div>
                      <Text strong>Timeout: </Text>
                      <Text code>{displayConfig?.ad?.timeout || '10000'}ms</Text>
                    </div>
                  </>
                ) : (
                  <Text type="secondary">Active Directory not configured</Text>
                )}
                
                <h4 style={{ marginTop: 16 }}>Azure AD/O365</h4>
                {displayConfig?.services?.azure ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Tenant ID: </Text>
                      <Text code>{displayConfig.services.azure.tenantId?.substring(0, 20)}...</Text>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong>Client ID: </Text>
                      <Text code>{displayConfig?.azure?.clientId?.substring(0, 20)}...</Text>
                    </div>
                    <div>
                      <Text strong>Authority: </Text>
                      <Text code>{displayConfig?.azure?.authority || `https://login.microsoftonline.com/${displayConfig.services.azure.tenantId}`}</Text>
                    </div>
                  </>
                ) : (
                  <Text type="secondary">Azure AD/O365 not configured</Text>
                )}
              </div>
            </Tabs.TabPane>
          </Tabs>
        </Card>

        <Card title="Actions" style={{ marginTop: 16 }}>
          <Space>
            <Button 
              type="primary"
              icon={<ReloadOutlined />}
              onClick={loadSystemConfig}
              loading={systemConfigLoading}
            >
              Refresh Configuration
            </Button>
            <Button 
              icon={<ToolOutlined />}
              onClick={() => message.info('Configuration export functionality coming soon')}
            >
              Export Configuration
            </Button>
          </Space>
        </Card>

        {displayConfig?.errors?.length > 0 && (
          <Alert
            message="Configuration Errors"
            description={
              <div>
                {displayConfig.errors.map((error: string, index: number) => (
                  <div key={index}>• {error}</div>
                ))}
              </div>
            }
            type="error"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}

        {displayConfig?.warnings?.length > 0 && (
          <Alert
            message="Configuration Warnings"
            description={
              <div>
                {displayConfig.warnings.map((warning: string, index: number) => (
                  <div key={index}>• {warning}</div>
                ))}
              </div>
            }
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </div>
    );
  };

  return (
    <div style={{ 
      minHeight: 'calc(100vh - 64px)',
      background: darkMode ? '#1a1a1a' : '#f5f5f5',
      transition: 'all 0.5s ease',
      position: 'relative',
      overflow: 'auto',
      padding: '32px'
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

      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '32px',
          fontWeight: 'bold',
          color: darkMode ? 'white' : '#1f2937',
          marginBottom: '24px'
        }}>Settings</h2>
      
        <style>{`
          .settings-tabs .ant-tabs-nav {
            background: transparent !important;
          }
          .settings-tabs .ant-tabs-tab {
            background: ${darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(255, 255, 255, 0.8)'} !important;
            border: ${darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(107, 114, 128, 0.2)'} !important;
            color: ${darkMode ? '#9ca3af' : '#6b7280'} !important;
            margin-right: 8px !important;
            border-radius: 12px !important;
            transition: all 0.2s ease !important;
            padding: 12px 24px !important;
            min-width: auto !important;
            white-space: nowrap !important;
          }
          .settings-tabs .ant-tabs-tab-btn {
            padding: 0 !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
          }
          .settings-tabs .ant-tabs-tab:hover {
            color: ${darkMode ? '#f3f4f6' : '#4b5563'} !important;
            background: ${darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(107, 114, 128, 0.1)'} !important;
          }
          .settings-tabs .ant-tabs-tab-active {
            background: #4a5568 !important;
            color: white !important;
            border-color: transparent !important;
          }
          .settings-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
            color: white !important;
          }
          .settings-tabs .ant-tabs-ink-bar {
            display: none;
          }
          .settings-tabs .ant-tabs-content {
            background: transparent !important;
          }
          .settings-tabs .ant-card {
            background: ${darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)'} !important;
            backdrop-filter: blur(20px) !important;
            border: ${darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)'} !important;
            border-radius: 16px !important;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1) !important;
          }
          .settings-tabs .ant-card-head {
            background: transparent !important;
            border-bottom: ${darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(229, 231, 235, 1)'} !important;
          }
          .settings-tabs .ant-card-body {
            background: transparent !important;
          }
          .settings-tabs .ant-form-item-label > label {
            color: ${darkMode ? '#e5e7eb' : '#374151'} !important;
          }
          .settings-tabs .ant-select-selector {
            background: ${darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(107, 114, 128, 0.05)'} !important;
            border: ${darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(107, 114, 128, 0.3)'} !important;
            border-radius: 12px !important;
          }
          .settings-tabs .ant-input {
            background: ${darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(107, 114, 128, 0.05)'} !important;
            border: ${darkMode ? '1px solid rgba(75, 85, 99, 0.3)' : '1px solid rgba(107, 114, 128, 0.3)'} !important;
            border-radius: 12px !important;
            color: ${darkMode ? 'white' : '#1f2937'} !important;
          }
          .settings-tabs .ant-input:focus,
          .settings-tabs .ant-select-focused .ant-select-selector {
            border-color: #4b5563 !important;
            box-shadow: 0 0 0 2px rgba(75, 85, 99, 0.2) !important;
          }
          .settings-tabs .ant-btn-primary {
            background: #4a5568 !important;
            border: none !important;
            height: auto !important;
            padding: 10px 20px !important;
            border-radius: 12px !important;
            font-weight: 500 !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
          }
          .settings-tabs .ant-btn-primary:hover {
            transform: scale(1.05) !important;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
          }
          .settings-tabs .ant-switch-checked {
            background: #4a5568 !important;
          }
          .settings-tabs .ant-statistic-title {
            color: ${darkMode ? '#9ca3af' : '#6b7280'} !important;
          }
          .settings-tabs .ant-statistic-content {
            color: ${darkMode ? 'white' : '#1f2937'} !important;
          }
        `}</style>
        <Tabs 
          activeKey={activeTab} 
          onChange={(key) => {
            setActiveTab(key);
            // Reset loaded flag when switching tabs
            if (key !== 'notifications') {
              setNotificationPreferencesLoaded(false);
            }
          }}
          className="settings-tabs"
          style={{ marginTop: '24px' }}
        >
        <TabPane 
          tab={
            <span>
              <SettingOutlined />
              General
            </span>
          } 
          key="general"
        >
          {renderGeneralTab()}
        </TabPane>
        
        <TabPane 
          tab={
            <span>
              <UserOutlined />
              Profile
            </span>
          } 
          key="profile"
        >
          {renderProfileTab()}
        </TabPane>
        
        <TabPane 
          tab={
            <span>
              <BellOutlined />
              Notifications
            </span>
          } 
          key="notifications"
        >
          {renderNotificationsTab()}
        </TabPane>
        
        <TabPane 
          tab={
            <span>
              <KeyOutlined />
              Credentials
            </span>
          } 
          key="credentials"
        >
          {renderCredentialsTab()}
        </TabPane>
        
        <TabPane 
          tab={
            <span>
              <ToolOutlined />
              System
            </span>
          } 
          key="system"
        >
          {renderSystemTab()}
        </TabPane>
      </Tabs>
      </div>
    </div>
  );
};

export default SettingsPage;