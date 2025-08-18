/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  TrendingUp, 
  FolderOpen, 
  Clock, 
  Calendar, 
  Settings,
  Search,
  Sun,
  Moon,
  Zap,
  X,
  Menu as MenuIcon,
  LogOut,
  Filter,
  PlusCircle,
  Bell,
  ChevronRight,
  FileText,
  Folder,
  Layout,
  Heart,
  ScrollText
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { logoutAsync } from '@/store/slices/authSlice';
import { toggleDarkMode, toggleSidebar, selectTheme, selectSidebarState, initializeUI } from '@/store/slices/uiSlice';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import { useNotifications } from '@/hooks/useNotifications';
import { searchService, SearchResult } from '@/services/searchService';
import { debounce } from 'lodash';
import '@/App.css';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  
  const { user } = useAppSelector(state => state.auth);
  const theme = useAppSelector(selectTheme);
  const { collapsed: sidebarCollapsed } = useAppSelector(selectSidebarState);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Notification hook
  const { stats: notificationStats } = useNotifications();
  
  const darkMode = theme.darkMode;
  const sidebarOpen = !sidebarCollapsed;
  
  useEffect(() => {
    dispatch(initializeUI());
  }, [dispatch]);

  // Debounced search function
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearchLoading(true);
    searchService.globalSearch(query)
      .then(results => {
        setSearchResults(results);
        setShowSearchResults(true);
      })
      .catch(error => {
        console.error('Search error:', error);
        setSearchResults([]);
      })
      .finally(() => {
        setSearchLoading(false);
      });
  }, []);

  // Handle search input change
  // Create debounced search
  const debouncedSearch = useCallback(
    debounce((query: string) => { performSearch(query); }, 300),
    []
  );

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    debouncedSearch(query);
  };
  // Handle clicking outside search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get current selected key based on pathname
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/reports/builder')) return 'builder';
    if (path.startsWith('/reports/history')) return 'history';
    if (path.startsWith('/templates')) return 'templates';
    if (path.startsWith('/reports/gallery')) return 'templates';
    if (path.startsWith('/reports/scheduled')) return 'scheduled';
    if (path.startsWith('/reports')) return 'templates';
    if (path.startsWith('/dashboard')) return 'dashboard';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/health')) return 'health';
    if (path.startsWith('/logs')) return 'logs';
    if (path.startsWith('/profile')) return 'profile';
    return 'dashboard';
  };

  // Handle logout
  const handleLogout = async () => {
    await dispatch(logoutAsync());
    navigate('/login');
  };

  // Navigation menu items with modern icons
  const navigationItems = [
    { id: 'dashboard', name: 'Dashboard', icon: TrendingUp, path: '/dashboard', color: '#4a5568 #6b7280', badge: null },
    { id: 'builder', name: 'Report Builder', icon: PlusCircle, path: '/reports/builder', color: '#10b981 #22c55e', badge: 'NEW' },
    { id: 'templates', name: 'Report Templates', icon: FolderOpen, path: '/templates', color: '#4b5563 #6b7280', badge: '24' },
    { id: 'history', name: 'Report History', icon: Clock, path: '/reports/history', color: '#f59e0b #f97316', badge: null },
    { id: 'scheduled', name: 'Scheduled Reports', icon: Calendar, path: '/reports/scheduled', color: '#f43f5e #ec4899', badge: '3' },
    { id: 'logs', name: 'System Logs', icon: ScrollText, path: '/logs', color: '#8b5cf6 #a78bfa', badge: null },
    { id: 'health', name: 'System Health', icon: Heart, path: '/health', color: '#52c41a #10b981', badge: null },
    { id: 'settings', name: 'Settings', icon: Settings, path: '/settings', color: '#6b7280 #4b5563', badge: null },
  ];

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      {/* Animated Background */}
      <div className="animated-bg">
        <div></div>
      </div>

      {/* Sidebar */}
      <div className={`sidebar-container ${sidebarOpen ? 'expanded' : 'collapsed'}`}>
        <div className="p-6">
          {/* Logo and Toggle */}
          <div className="flex items-center justify-between mb-8">
            <h1 className={`sidebar-title transition-all duration-300 ${sidebarOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 absolute'}`}>
              Report Hub
            </h1>
            <button
              onClick={() => dispatch(toggleSidebar())}
              className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition-all duration-300 hover:scale-110 group ${!sidebarOpen ? 'mx-auto' : ''}`}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <div className="transition-transform duration-300 group-hover:rotate-180">
                {sidebarOpen ? <X size={20} className={darkMode ? 'text-gray-300' : 'text-gray-600'} /> : <MenuIcon size={20} className={darkMode ? 'text-gray-300' : 'text-gray-600'} />}
              </div>
            </button>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            {navigationItems.map((item) => {
              const isActive = getSelectedKey() === item.id;
              return (
                <div key={item.id} className="relative group">
                  <button
                    onClick={() => navigate(item.path)}
                    className={`nav-button w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative overflow-hidden ${
                      isActive
                        ? 'text-white shadow-lg font-medium'
                        : `${darkMode ? 'hover:bg-gray-800/50 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`
                    }`}
                    style={isActive ? {
                      background: '#4a5568',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '500'
                    } : {}}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r-lg animate-pulse" />
                    )}
                    
                    {/* Icon */}
                    <div className="transition-colors duration-300">
                      <item.icon size={20} />
                    </div>
                    
                    {sidebarOpen && (
                      <>
                        <span className="font-medium flex-1 whitespace-nowrap">{item.name}</span>
                        {isActive && (
                          <ChevronRight size={16} className="animate-pulse" />
                        )}
                      </>
                    )}
                  </button>
                  
                  {/* Tooltip for collapsed sidebar */}
                  {!sidebarOpen && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                      {item.name}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Divider */}
          <div className={`my-4 mx-4 h-px ${darkMode ? 'bg-gray-800' : 'bg-gray-300'}`} />
          
          {/* User Profile Section - Functions as Logout */}
          <div className={`user-profile-section transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'} cursor-pointer`} onClick={handleLogout}>
            <div className="user-profile-content">
              <div className="user-avatar relative group">
                <div className="absolute inset-0 bg-gray-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
                <div className="relative">
                  <LogOut size={16} />
                </div>
              </div>
              {sidebarOpen && (
                <div className="flex-1">
                  <div className="user-display-name">
                    Logout
                  </div>
                  <div className="user-email">
                    Sign out of your account
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`main-content ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
        {/* Header */}
        <header className="header-bar">
          <div className="header-content">
            <div className="flex-between" style={{ height: '100%' }}>
              {/* Left side - Search */}
              <div className="flex-start flex-1" style={{ gap: '16px' }}>
                <div className="search-wrapper" ref={searchRef} style={{ position: 'relative' }}>
                  <Search 
                    className="search-icon"
                    size={20} 
                  />
                  <input
                    type="text"
                    placeholder="Search reports, templates, or schedules..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="input-primary search-input"
                  />
                  
                  {/* Search Results Dropdown */}
                  {showSearchResults && (
                    <div className="search-results-dropdown" style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      maxHeight: '400px',
                      overflow: 'auto',
                      background: theme.darkMode ? '#1f2937' : '#ffffff',
                      border: theme.darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      zIndex: 1000
                    }}>
                      {searchLoading ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: theme.darkMode ? '#9ca3af' : '#6b7280' }}>
                          Searching...
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map((result, index) => (
                          <div
                            key={result.id}
                            onClick={() => {
                              navigate(result.path);
                              setShowSearchResults(false);
                              setSearchQuery('');
                            }}
                            style={{
                              padding: '12px 16px',
                              cursor: 'pointer',
                              borderBottom: index < searchResults.length - 1 ? 
                                (theme.darkMode ? '1px solid #374151' : '1px solid #f3f4f6') : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              transition: 'background 0.2s',
                              background: 'transparent'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = theme.darkMode ? '#374151' : '#f3f4f6';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{
                              fontSize: '14px',
                              color: theme.darkMode ? '#d1d5db' : '#6b7280'
                            }}>
                              {result.type === 'report' && <FileText size={16} />}
                              {result.type === 'template' && <Folder size={16} />}
                              {result.type === 'page' && <Layout size={16} />}
                              {result.type === 'setting' && <Settings size={16} />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontWeight: 500,
                                color: theme.darkMode ? '#f3f4f6' : '#1f2937',
                                marginBottom: '2px'
                              }}>
                                {result.title}
                              </div>
                              {result.description && (
                                <div style={{
                                  fontSize: '12px',
                                  color: theme.darkMode ? '#9ca3af' : '#6b7280'
                                }}>
                                  {result.description}
                                </div>
                              )}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: theme.darkMode ? '#374151' : '#e5e7eb',
                              color: theme.darkMode ? '#d1d5db' : '#6b7280',
                              textTransform: 'uppercase'
                            }}>
                              {result.type}
                            </div>
                          </div>
                        ))
                      ) : searchQuery.trim() ? (
                        <div style={{ 
                          padding: '20px', 
                          textAlign: 'center', 
                          color: theme.darkMode ? '#9ca3af' : '#6b7280' 
                        }}>
                          No results found
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setFilterOpen(!filterOpen)}
                  className={filterOpen ? 'btn-gradient' : 'sidebar-toggle'}
                  style={{ padding: '8px' }}
                >
                  <Filter size={20} />
                </button>
              </div>
              
              {/* Right side - Enhanced Actions */}
              <div className="header-actions">
                {/* Notifications */}
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="notification-button"
                  >
                    <Bell size={20} className="notification-icon" />
                    {notificationStats?.unreadCount && notificationStats.unreadCount > 0 && (
                      <span 
                        className="notification-badge"
                        style={{
                          minWidth: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: 'white',
                          backgroundColor: '#374151',
                          borderRadius: '50%',
                          position: 'absolute',
                          top: '-2px',
                          right: '-2px',
                          border: `2px solid ${darkMode ? '#111827' : '#ffffff'}`
                        }}
                      >
                        {notificationStats.unreadCount > 99 ? '99+' : notificationStats.unreadCount}
                      </span>
                    )}
                  </button>
                  
                  <NotificationDropdown
                    isOpen={showNotifications}
                    onClose={() => setShowNotifications(false)}
                    onToggle={() => setShowNotifications(!showNotifications)}
                  />
                </div>

                {/* Dark mode toggle - Enhanced */}
                <button
                  onClick={() => dispatch(toggleDarkMode())}
                  className="theme-toggle"
                >
                  {darkMode ? <Sun size={20} className="theme-icon-sun" /> : <Moon size={20} className="theme-icon-moon" />}
                </button>

                {/* Quick Report Button - Enhanced */}
                <button
                  onClick={() => navigate('/reports/builder')}
                  className="quick-report-button"
                >
                  <Zap size={16} />
                  Quick Report
                </button>

                {/* User avatar - Enhanced */}
                <div 
                  className="header-user-avatar"
                  onClick={() => navigate('/profile')}
                >
                  {(user?.displayName || user?.username || 'User').substring(0, 2).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="main-content-area">
          <Outlet />
        </main>
      </div>


    </div>
  );
};

export default MainLayout;