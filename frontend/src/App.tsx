import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ConfigProvider, theme as antdTheme, App as AntdApp } from 'antd';
import { store } from '@/store';
import { useAppDispatch, useAppSelector } from '@/store';
import { initializeAuth } from '@/store/slices/authSlice';
import { initializeUI, selectTheme } from '@/store/slices/uiSlice';
import { activeAuthService as authService } from '@/services/authService.factory';
import { MsalAuthProvider } from '@/providers/MsalAuthProvider';

// Layout components
import MainLayout from '@/components/layout/MainLayout';
import AuthLayout from '@/components/layout/AuthLayout';

// Page components
import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import TemplatesPage from '@/pages/templates/TemplatesPageV2';
import ReportBuilderPage from '@/pages/reports/ReportBuilderPage';
import ReportHistoryPage from '@/pages/reports/ReportHistoryPage';
import TemplateGalleryPage from '@/pages/reports/TemplateGalleryPage';
import ScheduledReportsPage from '@/pages/reports/ScheduledReportsPage';
import QueryMetricsPage from '@/pages/reports/QueryMetricsPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import HealthPage from '@/pages/health/HealthPage';
import LogsPage from '@/pages/logs/LogsPage';


// Components
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import NotificationContainer from '@/components/ui/NotificationContainer';
import GlobalLoading from '@/components/ui/GlobalLoading';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

// Styles
import 'antd/dist/reset.css';
import './App.css';

const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const themeConfig = useAppSelector(selectTheme);
  const { isAuthenticated } = useAppSelector(state => state.auth);

  useEffect(() => {
    // Initialize app state
    dispatch(initializeAuth());
    dispatch(initializeUI());
    
    // Setup automatic token refresh
    authService.setupTokenRefresh();
    
  }, [dispatch]);

  // Configure Ant Design theme
  const antdThemeConfig = {
    algorithm: themeConfig.darkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: themeConfig.primaryColor,
      borderRadius: 6,
      ...(themeConfig.compactMode && {
        controlHeight: 28,
        fontSize: 12,
        padding: 8,
      }),
    },
    components: {
      Layout: {
        siderBg: themeConfig.darkMode ? '#001529' : '#f6f7f9',
        headerBg: themeConfig.darkMode ? '#001529' : '#ffffff',
      },
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
      },
      Table: {
        headerBg: themeConfig.darkMode ? '#262626' : '#fafafa',
      },
    },
  };

  return (
    <ConfigProvider theme={antdThemeConfig}>
      <AntdApp>
        <div className={`app ${themeConfig.darkMode ? 'dark' : 'light'} ${themeConfig.compactMode ? 'compact' : ''}`}>
          <ErrorBoundary>
            <Router>
              <Routes>
                {/* Public routes */}
                <Route
                  path="/login"
                  element={
                    isAuthenticated ? (
                      <Navigate to="/dashboard" replace />
                    ) : (
                      <AuthLayout>
                        <LoginPage />
                      </AuthLayout>
                    )
                  }
                />

                {/* Protected routes */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <MainLayout />
                    </ProtectedRoute>
                  }
                >
                  {/* Dashboard */}
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />

                  {/* Reports */}
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="templates" element={<TemplatesPage />} />
                  <Route path="reports/builder" element={<ReportBuilderPage />} />
                  <Route path="reports/builder/:id" element={<ReportBuilderPage />} />
                  <Route path="reports/history" element={<ReportHistoryPage />} />
                  <Route path="reports/history/:id" element={<ReportHistoryPage />} />
                  <Route path="reports/gallery" element={<TemplateGalleryPage />} />
                  <Route path="reports/scheduled" element={<ScheduledReportsPage />} />
                  <Route path="reports/metrics" element={<QueryMetricsPage />} />

                  {/* User */}
                  
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="health" element={<HealthPage />} />
                  <Route path="logs" element={<LogsPage />} />
                  
                  {/* Catch all */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>

                {/* Catch all for unauthenticated users */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>

              {/* Global components */}
              <NotificationContainer />
              <GlobalLoading />
            </Router>
          </ErrorBoundary>
        </div>
      </AntdApp>
    </ConfigProvider>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <MsalAuthProvider>
        <AppContent />
      </MsalAuthProvider>
    </Provider>
  );
};

export default App;