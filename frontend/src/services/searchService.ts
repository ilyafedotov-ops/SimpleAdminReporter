/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiService } from './api';

export interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'report' | 'template' | 'schedule' | 'setting' | 'page' | 'history';
  path: string;
  tags?: string[];
  lastAccessed?: string;
  favorite?: boolean;
  metadata?: Record<string, any>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

class SearchService {
  async globalSearch(query: string, options?: {
    types?: string[];
    limit?: number;
  }): Promise<SearchResult[]> {
    try {
      const response = await apiService.get<SearchResponse>('/search/global', {
        params: {
          q: query,
          types: options?.types?.join(','),
          limit: options?.limit || 20
        },
        timeout: 5000 // Add 5 second timeout
      });
      return ((response as any).data)?.results || [];
    } catch (error) {
      console.error('Global search error:', error);
      // Return static pages as fallback
      return this.getStaticSearchResults(query);
    }
  }

  // Fallback search for static pages and known routes
  private getStaticSearchResults(query: string): SearchResult[] {
    const allPages: SearchResult[] = [
      {
        id: 'dashboard',
        title: 'Dashboard',
        description: 'View reporting dashboard and statistics',
        type: 'page',
        path: '/dashboard',
        tags: ['home', 'overview', 'stats']
      },
      {
        id: 'templates',
        title: 'Report Templates',
        description: 'Browse and manage report templates',
        type: 'page',
        path: '/templates',
        tags: ['reports', 'templates', 'prebuilt']
      },
      {
        id: 'builder',
        title: 'Report Builder',
        description: 'Create custom reports with visual builder',
        type: 'page',
        path: '/reports/builder',
        tags: ['create', 'custom', 'builder', 'new']
      },
      {
        id: 'history',
        title: 'Report History',
        description: 'View previously generated reports',
        type: 'page',
        path: '/reports/history',
        tags: ['history', 'past', 'archive']
      },
      {
        id: 'scheduled',
        title: 'Scheduled Reports',
        description: 'Manage scheduled report generation',
        type: 'page',
        path: '/reports/scheduled',
        tags: ['schedule', 'automatic', 'recurring']
      },
      {
        id: 'settings',
        title: 'Settings',
        description: 'Configure application settings',
        type: 'page',
        path: '/settings',
        tags: ['config', 'preferences', 'options']
      },
      {
        id: 'profile',
        title: 'User Profile',
        description: 'Manage your user profile',
        type: 'page',
        path: '/profile',
        tags: ['user', 'account', 'profile']
      },
      // Common report templates
      {
        id: 'inactive-users',
        title: 'Inactive Users Report',
        description: 'Find users who haven\'t logged in recently',
        type: 'template',
        path: '/templates?search=inactive+users',
        tags: ['ad', 'users', 'inactive', 'audit']
      },
      {
        id: 'password-expiry',
        title: 'Password Expiry Report',
        description: 'List users with expiring passwords',
        type: 'template',
        path: '/templates?search=password+expiry',
        tags: ['ad', 'security', 'password', 'compliance']
      },
      {
        id: 'mfa-status',
        title: 'MFA Status Report',
        description: 'Check multi-factor authentication status',
        type: 'template',
        path: '/templates?search=mfa',
        tags: ['azure', 'security', 'mfa', 'authentication']
      },
      {
        id: 'mailbox-usage',
        title: 'Mailbox Usage Report',
        description: 'Monitor mailbox storage usage',
        type: 'template',
        path: '/templates?search=mailbox',
        tags: ['o365', 'email', 'storage', 'usage']
      },
      // Settings pages
      {
        id: 'credentials',
        title: 'Service Credentials',
        description: 'Manage service account credentials',
        type: 'setting',
        path: '/settings?tab=credentials',
        tags: ['credentials', 'auth', 'service', 'accounts']
      },
      {
        id: 'notifications',
        title: 'Notification Settings',
        description: 'Configure notification preferences',
        type: 'setting',
        path: '/settings?tab=notifications',
        tags: ['alerts', 'email', 'notifications']
      }
    ];

    // Filter results based on query
    const lowerQuery = query.toLowerCase();
    return allPages.filter(page => {
      const searchableText = [
        page.title,
        page.description,
        ...(page.tags || [])
      ].join(' ').toLowerCase();
      
      return searchableText.includes(lowerQuery);
    }).slice(0, 10);
  }

  // Get recent searches from local storage
  getRecentSearches(): string[] {
    try {
      const recent = localStorage.getItem('recentSearches');
      return recent ? JSON.parse(recent) : [];
    } catch {
      return [];
    }
  }

  // Save search to recent searches
  saveRecentSearch(query: string): void {
    try {
      const recent = this.getRecentSearches();
      const updated = [query, ...recent.filter(q => q !== query)].slice(0, 5);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving recent search:', error);
    }
  }
}

export const searchService = new SearchService();