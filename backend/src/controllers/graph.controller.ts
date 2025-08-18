import { Request, Response, NextFunction } from 'express';
import { GraphQueryExecutor } from '../services/graph-query-executor.service';
import { GraphFieldDiscoveryService } from '../services/graph-field-discovery.service';
import { getQueryById, getQueriesByCategory, getAllQueries } from '../queries/graph';
import { logger } from '../utils/logger';
import { User } from '@/auth/types';

// Extend Request to include user
interface AuthenticatedRequest extends Request {
  user?: User;
}

class GraphController {
  private queryExecutor: GraphQueryExecutor;
  private fieldDiscovery: GraphFieldDiscoveryService;

  constructor() {
    this.queryExecutor = new GraphQueryExecutor();
    this.fieldDiscovery = new GraphFieldDiscoveryService();
  }

  /**
   * Get all Graph query templates
   */
  getTemplates = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category } = req.query;
      
      const queries = category 
        ? getQueriesByCategory(category as string)
        : getAllQueries();

      res.json({
        success: true,
        data: {
          templates: queries.map(q => ({
            id: q.id,
            name: q.name,
            description: q.description,
            category: q.category,
            parameters: q.parameters || {},
            fieldMappings: q.fieldMappings || {}
          })),
          totalCount: queries.length
        }
      });
    } catch (error) {
      logger.error('Error fetching Graph templates:', error);
      next(error);
    }
  };

  /**
   * Execute a Graph query
   */
  executeQuery = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { queryId } = req.params;
      const { parameters = {}, credentialId, context } = req.body;
      const _userId = req.user!.id;

      const queryDef = getQueryById(queryId);
      if (!queryDef) {
        return res.status(404).json({
          success: false,
          error: 'Query template not found'
        });
      }

      const result = await this.queryExecutor.executeQuery({
        queryId: queryId,
        userId: _userId,
        credentialId,
        parameters,
        saveHistory: true,
        graphContext: context
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error executing Graph query:', error);
      next(error);
    }
  };

  /**
   * Discover fields for a Graph entity type
   */
  discoverFields = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { entityType } = req.params;
    const { refresh = false } = req.query;
    // const { _category } = req.query; // Reserved for future use
    const _userId = req.user!.id;

    try {
      // Create credential context for the user
      const context = { userId: _userId };

      const schema = await this.fieldDiscovery.discoverFields(
        entityType as 'user' | 'group' | 'application' | 'device' | 'directoryRole',
        context
      );

      logger.info(`Graph fields discovered for ${entityType}:`, {
        fieldsCount: schema.fields.length,
        _userId
      });

      res.json({
        success: true,
        data: {
          entityType,
          fields: schema.fields,
          totalFields: schema.fields.length,
          refreshed: refresh === 'true'
        }
      });
    } catch (error) {
      logger.error('Error discovering Graph fields:', {
        entityType,
        userId: _userId,
        error: error instanceof Error ? ((error as any)?.message || String(error)) : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Check if this is an authentication error
      const errorMessage = error instanceof Error ? ((error as any)?.message || String(error)) : String(error);
      if (errorMessage.includes('authentication') || 
          errorMessage.includes('unauthorized') || 
          errorMessage.includes('401') ||
          errorMessage.includes('Azure AD authentication required')) {
        return res.status(401).json({
          success: false,
          error: 'Azure AD authentication required. Please authenticate with your Azure AD account.',
          code: 'AUTH_REQUIRED'
        });
      }
      
      next(error);
    }
  };

  /**
   * Search fields
   */
  searchFields = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { entityType } = req.params;
      const { search } = req.query;

      if (!search) {
        return res.status(400).json({
          success: false,
          error: 'Search term is required'
        });
      }

      // Get all fields and filter client-side for now
      const schema = await this.fieldDiscovery.discoverFields(
        entityType as 'user' | 'group' | 'application' | 'device' | 'directoryRole'
      );

      const searchTerm = (search as string).toLowerCase();
      const filteredFields = schema.fields.filter(field =>
        field.name.toLowerCase().includes(searchTerm) ||
        field.displayName.toLowerCase().includes(searchTerm) ||
        (field.description && field.description.toLowerCase().includes(searchTerm))
      );

      res.json({
        success: true,
        data: {
          entityType,
          fields: filteredFields,
          searchTerm: search
        }
      });
    } catch (error) {
      logger.error('Error searching Graph fields:', error);
      next(error);
    }
  };

  /**
   * Get execution history
   */
  getHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // const { _queryId, _limit = 50, _offset = 0 } = req.query; // Reserved for future use
      // const __userId = req.user!.id;

      // Simple stub for execution history - implement actual logic later
      const history: any[] = [];

      res.json({
        success: true,
        data: { history }
      });
    } catch (error) {
      logger.error('Error fetching Graph execution history:', error);
      next(error);
    }
  };

  /**
   * Get specific execution result
   */
  getExecutionResult = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // const { _executionId } = req.params; // Reserved for future use
      // const __userId = req.user!.id;

      // Simple stub for execution result - implement actual logic later
      const execution = null;

      if (!execution) {
        return res.status(404).json({
          success: false,
          error: 'Execution not found'
        });
      }

      res.json({
        success: true,
        data: { execution }
      });
    } catch (error) {
      logger.error('Error fetching Graph execution result:', error);
      next(error);
    }
  };

  /**
   * Execute batch queries
   */
  executeBatch = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { queries } = req.body;
      const _userId = req.user!.id;

      if (!Array.isArray(queries) || queries.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Queries array is required'
        });
      }

      const results = await Promise.allSettled(
        queries.map(async (q) => {
          const queryDef = getQueryById(q.queryId);
          if (!queryDef) {
            throw new Error(`Query ${q.queryId} not found`);
          }

          return this.queryExecutor.executeQuery({
            queryId: q.queryId,
            userId: _userId,
            parameters: q.parameters || {},
            saveHistory: false
          });
        })
      );

      res.json({
        success: true,
        data: {
          results: results.map((result, index) => {
            if (result.status === 'fulfilled') {
              return result.value;
            } else {
              return {
                queryId: queries[index].queryId,
                error: result.reason.message
              };
            }
          })
        }
      });
    } catch (error) {
      logger.error('Error executing Graph batch queries:', error);
      next(error);
    }
  };
}

export const graphController = new GraphController();