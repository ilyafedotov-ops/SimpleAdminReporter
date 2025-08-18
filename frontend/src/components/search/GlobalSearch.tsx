/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, List, Modal, Tag, Empty, Spin } from 'antd';
import { SearchOutlined, StarOutlined } from '@ant-design/icons';
import { 
  FileText, 
  Folder, 
  Clock,
  Calendar,
  Settings,
  // User,
  LayoutDashboard,
  History
} from 'lucide-react';
import { debounce } from 'lodash';
import { searchService } from '@/services/searchService';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'report' | 'template' | 'schedule' | 'setting' | 'page' | 'history';
  path: string;
  icon?: React.ReactNode;
  tags?: string[];
  lastAccessed?: string;
  favorite?: boolean;
}

interface GlobalSearchProps {
  visible: boolean;
  onClose: () => void;
  initialQuery?: string;
}

const getIconForType = (type: string) => {
  switch (type) {
    case 'report':
      return <FileText size={18} />;
    case 'template':
      return <Folder size={18} />;
    case 'schedule':
      return <Calendar size={18} />;
    case 'history':
      return <History size={18} />;
    case 'setting':
      return <Settings size={18} />;
    case 'page':
      return <LayoutDashboard size={18} />;
    default:
      return <FileText size={18} />;
  }
};

const getTagColor = (type: string) => {
  switch (type) {
    case 'report':
      return 'blue';
    case 'template':
      return 'green';
    case 'schedule':
      return 'orange';
    case 'history':
      return 'purple';
    case 'setting':
      return 'red';
    case 'page':
      return 'cyan';
    default:
      return 'default';
  }
};

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ visible, onClose, initialQuery = '' }) => {
  const navigate = useNavigate();
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<any>(null);

  // Debounced search function
  const performSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        const results = await searchService.globalSearch(query);
        setSearchResults(results);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  // Update searchQuery when initialQuery changes
  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  // Focus input when modal opens and trigger search if there's an initial query
  useEffect(() => {
    if (visible) {
      if (inputRef.current) {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
      if (initialQuery.trim()) {
        performSearch(initialQuery);
      }
    }
  }, [visible, initialQuery, performSearch]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedIndex(0);
    }
  }, [visible]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    performSearch(query);
  };

  // Handle result selection
  const handleSelectResult = (result: SearchResult) => {
    navigate(result.path);
    onClose();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && searchResults[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(searchResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={600}
      style={{ top: 100 }}
      bodyStyle={{ padding: 0 }}
      className={darkMode ? 'dark-mode' : ''}
    >
      <div style={{ 
        borderRadius: '8px',
        overflow: 'hidden',
        background: darkMode ? '#1f2937' : '#ffffff'
      }}>
        {/* Search Input */}
        <div style={{ 
          padding: '20px',
          borderBottom: darkMode ? '1px solid #374151' : '1px solid #e5e7eb'
        }}>
          <Input
            ref={inputRef}
            size="large"
            placeholder="Search for reports, templates, settings..."
            prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            allowClear
            style={{
              background: darkMode ? '#111827' : '#f9fafb',
              border: 'none',
              borderRadius: '8px'
            }}
          />
          <div style={{
            marginTop: '12px',
            fontSize: '12px',
            color: '#9ca3af',
            display: 'flex',
            gap: '20px'
          }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
        </div>

        {/* Search Results */}
        <div style={{ 
          maxHeight: '400px', 
          overflow: 'auto',
          background: darkMode ? '#1f2937' : '#ffffff'
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Spin tip="Searching..." />
            </div>
          ) : searchResults.length > 0 ? (
            <List
              dataSource={searchResults}
              renderItem={(item, index) => (
                <List.Item
                  onClick={() => handleSelectResult(item)}
                  style={{
                    cursor: 'pointer',
                    padding: '12px 20px',
                    background: index === selectedIndex 
                      ? (darkMode ? '#374151' : '#f3f4f6')
                      : 'transparent',
                    borderBottom: darkMode ? '1px solid #374151' : '1px solid #f3f4f6',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <List.Item.Meta
                    avatar={
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: darkMode ? '#374151' : '#e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        color: darkMode ? '#d1d5db' : '#6b7280'
                      }}>
                        {getIconForType(item.type)}
                      </div>
                    }
                    title={
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        <span style={{ 
                          fontWeight: 500,
                          color: darkMode ? '#f3f4f6' : '#1f2937'
                        }}>
                          {item.title}
                        </span>
                        {item.favorite && (
                          <StarOutlined style={{ color: '#fbbf24', fontSize: '14px' }} />
                        )}
                        <Tag color={getTagColor(item.type)} style={{ marginLeft: 'auto' }}>
                          {item.type.toUpperCase()}
                        </Tag>
                      </div>
                    }
                    description={
                      <div>
                        {item.description && (
                          <div style={{ 
                            color: darkMode ? '#9ca3af' : '#6b7280',
                            fontSize: '13px',
                            marginBottom: '4px'
                          }}>
                            {item.description}
                          </div>
                        )}
                        <div style={{ 
                          fontSize: '12px', 
                          color: darkMode ? '#6b7280' : '#9ca3af',
                          display: 'flex',
                          gap: '12px'
                        }}>
                          <span>{item.path}</span>
                          {item.lastAccessed && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} /> {item.lastAccessed}
                            </span>
                          )}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          ) : searchQuery.trim() ? (
            <Empty
              description="No results found"
              style={{ padding: '40px' }}
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              <p>Start typing to search across the application</p>
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ color: darkMode ? '#d1d5db' : '#4b5563', marginBottom: '12px' }}>
                  Quick Links
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  <a 
                    onClick={() => handleSelectResult({ 
                      id: '1', 
                      title: 'Report Templates', 
                      type: 'page', 
                      path: '/templates' 
                    })}
                    style={{ cursor: 'pointer', color: '#3b82f6' }}
                  >
                    Browse Report Templates
                  </a>
                  <a 
                    onClick={() => handleSelectResult({ 
                      id: '2', 
                      title: 'Report Builder', 
                      type: 'page', 
                      path: '/reports/builder' 
                    })}
                    style={{ cursor: 'pointer', color: '#3b82f6' }}
                  >
                    Create New Report
                  </a>
                  <a 
                    onClick={() => handleSelectResult({ 
                      id: '3', 
                      title: 'Settings', 
                      type: 'page', 
                      path: '/settings' 
                    })}
                    style={{ cursor: 'pointer', color: '#3b82f6' }}
                  >
                    Application Settings
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default GlobalSearch;