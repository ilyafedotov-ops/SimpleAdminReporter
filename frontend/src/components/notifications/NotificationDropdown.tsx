import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bell, 
  Check, 
  X, 
  Clock, 
  AlertTriangle, 
  Info, 
  CheckCircle,
  XCircle,
  Settings,
  Mail
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { selectTheme, decrementUnreadCount, incrementUnreadCount } from '@/store/slices/uiSlice';
import notificationService, { Notification, NotificationStats } from '@/services/notificationService';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ isOpen, onClose, onToggle: _onToggle }) => {
  const dispatch = useAppDispatch();
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats>({
    totalCount: 0,
    unreadCount: 0,
    highPriorityUnread: 0,
    recentCount: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const filters = filter === 'unread' ? { isRead: false, isDismissed: false } : { isDismissed: false };
      const result = await notificationService.getUserNotifications(1, 20, filters);
      setNotifications((result as { data?: Notification[] })?.data || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      fetchStats();
    }
  }, [isOpen, filter, fetchNotifications]);

  const fetchStats = async () => {
    try {
      const stats = await notificationService.getNotificationStats();
      setStats(stats);
    } catch (err) {
      console.error('Failed to fetch notification stats:', err);
    }
  };

  const handleMarkAsRead = async (notification: Notification) => {
    try {
      // Optimistic update
      setNotifications(prev => 
        prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n)
      );
      setStats(prev => ({ ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) }));
      dispatch(decrementUnreadCount(1));
      
      await notificationService.markAsRead(notification.id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      // Revert optimistic update on error
      setNotifications(prev => 
        prev.map(n => n.id === notification.id ? { ...n, isRead: false } : n)
      );
      setStats(prev => ({ ...prev, unreadCount: prev.unreadCount + 1 }));
      dispatch(incrementUnreadCount(1));
    }
  };

  const handleMarkAsUnread = async (notification: Notification) => {
    try {
      // Optimistic update
      setNotifications(prev => 
        prev.map(n => n.id === notification.id ? { ...n, isRead: false } : n)
      );
      setStats(prev => ({ ...prev, unreadCount: prev.unreadCount + 1 }));
      dispatch(incrementUnreadCount(1));
      
      await notificationService.markAsUnread(notification.id);
    } catch (err) {
      console.error('Failed to mark notification as unread:', err);
      // Revert optimistic update on error
      setNotifications(prev => 
        prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n)
      );
      setStats(prev => ({ ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) }));
      dispatch(decrementUnreadCount(1));
    }
  };

  const handleDismiss = async (notification: Notification) => {
    try {
      // Optimistic update
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      setStats(prev => ({ 
        ...prev, 
        totalCount: Math.max(0, prev.totalCount - 1),
        unreadCount: !notification.isRead ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount
      }));
      
      if (!notification.isRead) {
        dispatch(decrementUnreadCount(1));
      }
      
      await notificationService.dismissNotification(notification.id);
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
      // Revert optimistic update on error
      setNotifications(prev => [...prev, notification]);
      setStats(prev => ({ 
        ...prev, 
        totalCount: prev.totalCount + 1,
        unreadCount: !notification.isRead ? prev.unreadCount + 1 : prev.unreadCount
      }));
      
      if (!notification.isRead) {
        dispatch(incrementUnreadCount(1));
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      // Update stats
      setStats(prev => ({ ...prev, unreadCount: 0 }));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    const iconProps = { size: 16 };
    
    switch (type) {
      case 'success':
      case 'report_complete':
        return <CheckCircle {...iconProps} style={{ color: '#4b5563' }} />;
      case 'error':
      case 'report_failed':
        return <XCircle {...iconProps} style={{ color: '#1f2937' }} />;
      case 'warning':
        return <AlertTriangle {...iconProps} style={{ color: '#6b7280' }} />;
      case 'system':
        return <Settings {...iconProps} style={{ color: '#374151' }} />;
      case 'reminder':
        return <Clock {...iconProps} style={{ color: '#6b7280' }} />;
      default:
        return <Info {...iconProps} style={{ color: '#374151' }} />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
  };

  // Removed getPriorityColor function as it's now handled inline

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        width: '384px',
        maxHeight: '384px',
        overflow: 'hidden',
        zIndex: 50,
        borderRadius: '12px',
        background: darkMode ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}
    >
      {/* Header */}
      <div 
        style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: `1px solid ${darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.8)'}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={18} style={{ color: darkMode ? '#d1d5db' : '#374151' }} />
          <h3 style={{ 
            fontWeight: '600',
            fontSize: '16px',
            margin: 0,
            color: darkMode ? 'white' : '#111827'
          }}>
            Notifications
          </h3>
          {stats?.unreadCount && stats.unreadCount > 0 && (
            <span 
              style={{
                padding: '4px 8px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: '#4a5568',
                color: 'white'
              }}
            >
              {stats.unreadCount}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Filter buttons */}
          <div style={{ 
            display: 'flex',
            backgroundColor: darkMode ? '#374151' : '#f3f4f6',
            borderRadius: '8px',
            padding: '4px'
          }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === 'all' 
                  ? (darkMode ? '#4b5563' : 'white')
                  : 'transparent',
                color: filter === 'all'
                  ? (darkMode ? 'white' : '#111827')
                  : (darkMode ? '#d1d5db' : '#4b5563'),
                boxShadow: filter === 'all' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none'
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                transition: 'all 0.2s',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === 'unread' 
                  ? (darkMode ? '#4b5563' : 'white')
                  : 'transparent',
                color: filter === 'unread'
                  ? (darkMode ? 'white' : '#111827')
                  : (darkMode ? '#d1d5db' : '#4b5563'),
                boxShadow: filter === 'unread' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none'
              }}
            >
              Unread
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              border: '2px solid transparent',
              borderTop: '2px solid #4a5568',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        ) : error ? (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <XCircle size={24} style={{ 
              margin: '0 auto 8px auto', 
              color: '#374151',
              display: 'block'
            }} />
            <p style={{
              fontSize: '14px',
              color: darkMode ? '#d1d5db' : '#4b5563',
              margin: '0 0 8px 0'
            }}>
              {error}
            </p>
            <button
              onClick={fetchNotifications}
              style={{
                marginTop: '8px',
                fontSize: '12px',
                color: '#4a5568',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Try again
            </button>
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Bell size={32} style={{ 
              margin: '0 auto 12px auto',
              color: darkMode ? '#6b7280' : '#9ca3af',
              display: 'block'
            }} />
            <p style={{
              fontWeight: '500',
              color: darkMode ? '#d1d5db' : '#374151',
              margin: '0 0 4px 0'
            }}>
              No notifications
            </p>
            <p style={{
              fontSize: '14px',
              marginTop: '4px',
              color: '#6b7280',
              margin: 0
            }}>
              {filter === 'unread' ? 'All caught up!' : 'We\'ll notify you when something happens'}
            </p>
          </div>
        ) : (
          (notifications || []).map((notification) => {
            const priorityColors = {
              5: '#1f2937', // dark gray
              4: '#374151', // dark gray  
              3: '#4b5563', // medium gray
              2: '#6b7280', // gray
              1: '#6b7280'  // gray
            };
            const priorityColor = priorityColors[notification.priority as keyof typeof priorityColors] || priorityColors[1];
            
            return (
              <div
                key={notification.id}
                style={{
                  borderLeft: `4px solid ${priorityColor}`,
                  backgroundColor: !notification.isRead 
                    ? (darkMode ? 'rgba(74, 85, 104, 0.1)' : 'rgba(74, 85, 104, 0.05)')
                    : 'transparent'
                }}
              >
                <div style={{
                  padding: '16px',
                  transition: 'background-color 0.2s',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = darkMode ? 'rgba(31, 41, 55, 0.5)' : 'rgba(249, 250, 251, 1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = !notification.isRead 
                    ? (darkMode ? 'rgba(74, 85, 104, 0.1)' : 'rgba(74, 85, 104, 0.05)')
                    : 'transparent';
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flexShrink: 0, marginTop: '2px' }}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{
                            fontWeight: '500',
                            fontSize: '14px',
                            color: darkMode ? 'white' : '#111827',
                            margin: '0 0 4px 0'
                          }}>
                            {notification.title}
                          </p>
                          <p style={{
                            fontSize: '14px',
                            marginTop: '4px',
                            color: darkMode ? '#d1d5db' : '#4b5563',
                            margin: '4px 0 8px 0'
                          }}>
                            {notification.message}
                          </p>
                          <p style={{
                            fontSize: '12px',
                            marginTop: '8px',
                            color: '#6b7280',
                            margin: '8px 0 0 0'
                          }}>
                            {formatTimeAgo(notification.createdAt)}
                          </p>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                          {!notification.isRead ? (
                            <button
                              onClick={() => handleMarkAsRead(notification)}
                              style={{
                                padding: '4px',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = darkMode ? '#374151' : '#e5e7eb';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                              title="Mark as read"
                            >
                              <Check size={14} style={{ color: '#6b7280' }} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMarkAsUnread(notification)}
                              style={{
                                padding: '4px',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = darkMode ? '#374151' : '#e5e7eb';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                              title="Mark as unread"
                            >
                              <Mail size={14} style={{ color: '#6b7280' }} />
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleDismiss(notification)}
                            style={{
                              padding: '4px',
                              borderRadius: '4px',
                              border: 'none',
                              backgroundColor: 'transparent',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = darkMode ? '#374151' : '#e5e7eb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Dismiss"
                          >
                            <X size={14} style={{ color: '#6b7280' }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications && notifications.length > 0 && (
        <div 
          style={{
            padding: '12px',
            borderTop: `1px solid ${darkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.8)'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {stats?.unreadCount && stats.unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                style={{
                  fontSize: '14px',
                  color: '#4a5568',
                  fontWeight: '500',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#2d3748';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#4a5568';
                }}
              >
                Mark all as read
              </button>
            )}
            
            <button
              onClick={onClose}
              style={{
                fontSize: '14px',
                color: darkMode ? '#9ca3af' : '#4b5563',
                fontWeight: '500',
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = darkMode ? '#d1d5db' : '#374151';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = darkMode ? '#9ca3af' : '#4b5563';
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;