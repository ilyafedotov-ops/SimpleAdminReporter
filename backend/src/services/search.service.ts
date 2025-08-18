import { db, Database } from '@/config/database';
import { logger } from '../utils/logger';

interface SearchResult {
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

interface SearchOptions {
  types?: string[];
  limit?: number;
}

class SearchService {
  private db: Database;

  constructor() {
    this.db = db;
  }

  async globalSearch(
    query: string, 
    userId: number,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { types, limit = 20 } = options;
    const results: SearchResult[] = [];
    const searchTerm = `%${query.toLowerCase()}%`;

    try {
      // Search report templates
      if (!types || types.includes('template')) {
        const templatesQuery = `
          SELECT id, name, description, category::text as category, report_type
          FROM report_templates
          WHERE LOWER(name) LIKE $1 
            OR LOWER(description) LIKE $1 
            OR LOWER(category::text) LIKE $1
          LIMIT $2
        `;
        
        const templatesResult = await this.db.query(templatesQuery, [searchTerm, limit]);
        
        results.push(...templatesResult.rows.map((template: any) => ({
          id: template.id.toString(),
          title: template.name,
          description: template.description || undefined,
          type: 'template' as const,
          path: `/templates?id=${template.id}`,
          tags: [template.category, template.report_type].filter(Boolean),
          metadata: {
            category: template.category,
            dataSource: template.category
          }
        })));
      }

      // Search custom reports
      if (!types || types.includes('report')) {
        const customReportsQuery = `
          SELECT id, name, description, source::text as source, is_public
          FROM custom_report_templates
          WHERE created_by = $1
            AND (LOWER(name) LIKE $2 OR LOWER(description) LIKE $2)
          LIMIT $3
        `;
        
        const customReportsResult = await this.db.query(customReportsQuery, [userId, searchTerm, limit]);
        
        results.push(...customReportsResult.rows.map((report: any) => ({
          id: `custom-${report.id}`,
          title: report.name,
          description: report.description || undefined,
          type: 'report' as const,
          path: `/reports/builder?id=${report.id}`,
          tags: ['custom', report.source].filter(Boolean),
          favorite: false, // is_favorite column doesn't exist
          metadata: {
            dataSource: report.source,
            isPublic: report.is_public
          }
        })));
      }

      // Search report history - simplified for now
      // Skip history search since it requires complex joins

      // Search scheduled reports - skip for now since table structure is different

      // Add static pages if they match
      if (!types || types.includes('page')) {
        const cleanQuery = query.toLowerCase(); // Don't use searchTerm with % for static search
        const staticPages = this.getStaticPages().filter(page => 
          page.title.toLowerCase().includes(cleanQuery) ||
          page.description?.toLowerCase().includes(cleanQuery) ||
          page.tags?.some(tag => tag.toLowerCase().includes(cleanQuery))
        );
        results.push(...staticPages.slice(0, limit));
      }

      // Sort by relevance (title matches first, then description)
      const cleanQuery = query.toLowerCase();
      results.sort((a, b) => {
        const aInTitle = a.title.toLowerCase().includes(cleanQuery);
        const bInTitle = b.title.toLowerCase().includes(cleanQuery);
        if (aInTitle && !bInTitle) return -1;
        if (!aInTitle && bInTitle) return 1;
        return 0;
      });

      // Record search
      await this.recordSearch(userId, query);

      return results.slice(0, limit);
    } catch (error) {
      logger.error('Search error:', error);
      throw error; // Re-throw to let controller handle it
    }
  }

  async getSuggestions(query: string, userId: number): Promise<string[]> {
    try {
      // Get recent searches that match
      const recentSearchesQuery = `
        SELECT DISTINCT query
        FROM user_search_history
        WHERE user_id = $1
          AND LOWER(query) LIKE $2
        ORDER BY searched_at DESC
        LIMIT 5
      `;
      
      const recentSearchesResult = await this.db.query(recentSearchesQuery, [userId, `%${query.toLowerCase()}%`]);

      // Get common report names
      const templatesQuery = `
        SELECT name
        FROM report_templates
        WHERE LOWER(name) LIKE $1
        LIMIT 5
      `;
      
      const templatesResult = await this.db.query(templatesQuery, [`%${query.toLowerCase()}%`]);

      const suggestions = [
        ...recentSearchesResult.rows.map((s: any) => s.query),
        ...templatesResult.rows.map((t: any) => t.name)
      ];

      return [...new Set(suggestions)].slice(0, 10);
    } catch (error) {
      logger.error('Suggestions error:', error);
      return [];
    }
  }

  async getRecentSearches(userId: number): Promise<string[]> {
    try {
      const query = `
        SELECT DISTINCT query
        FROM user_search_history
        WHERE user_id = $1
        ORDER BY searched_at DESC
        LIMIT 10
      `;
      
      const result = await this.db.query(query, [userId]);
      return result.rows.map((s: any) => s.query);
    } catch (error) {
      logger.error('Recent searches error:', error);
      return [];
    }
  }

  private async recordSearch(userId: number, query: string): Promise<void> {
    try {
      const insertQuery = `
        INSERT INTO user_search_history (user_id, query, searched_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, query) 
        DO UPDATE SET searched_at = $3
      `;
      
      await this.db.query(insertQuery, [userId, query, new Date()]);
    } catch (error) {
      // Don't throw, just log
      logger.error('Error recording search:', error);
    }
  }

  private getStaticPages(): SearchResult[] {
    return [
      {
        id: 'page-dashboard',
        title: 'Dashboard',
        description: 'View reporting dashboard and statistics',
        type: 'page',
        path: '/dashboard',
        tags: ['home', 'overview', 'stats', 'dashboard']
      },
      {
        id: 'page-templates',
        title: 'Report Templates',
        description: 'Browse and manage report templates',
        type: 'page',
        path: '/templates',
        tags: ['reports', 'templates', 'prebuilt']
      },
      {
        id: 'page-builder',
        title: 'Report Builder',
        description: 'Create custom reports with visual builder',
        type: 'page',
        path: '/reports/builder',
        tags: ['create', 'custom', 'builder', 'new', 'report']
      },
      {
        id: 'page-history',
        title: 'Report History',
        description: 'View previously generated reports',
        type: 'page',
        path: '/reports/history',
        tags: ['history', 'past', 'archive', 'reports']
      },
      {
        id: 'page-scheduled',
        title: 'Scheduled Reports',
        description: 'Manage scheduled report generation',
        type: 'page',
        path: '/reports/scheduled',
        tags: ['schedule', 'automatic', 'recurring', 'reports']
      },
      {
        id: 'page-settings',
        title: 'Settings',
        description: 'Configure application settings',
        type: 'page',
        path: '/settings',
        tags: ['config', 'preferences', 'options', 'settings']
      },
      {
        id: 'page-credentials',
        title: 'Service Credentials',
        description: 'Manage service account credentials',
        type: 'setting',
        path: '/settings',
        tags: ['credentials', 'auth', 'service', 'accounts', 'settings']
      },
      {
        id: 'page-notifications',
        title: 'Notification Settings',
        description: 'Configure notification preferences',
        type: 'setting',
        path: '/settings',
        tags: ['alerts', 'email', 'notifications', 'settings']
      }
    ];
  }
}

export const searchService = new SearchService();