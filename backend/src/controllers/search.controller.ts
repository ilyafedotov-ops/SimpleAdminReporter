import { Request, Response } from 'express';
import { searchService } from '../services/search.service';
import { logger } from '../utils/logger';

export const searchController = {
  async globalSearch(req: Request, res: Response) {
    try {
      const { q: query, types, limit = 20 } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ 
          error: 'Search query is required' 
        });
      }

      const typeFilter = types ? String(types).split(',') : undefined;
      const results = await searchService.globalSearch(
        query,
        req.user!.id,
        {
          types: typeFilter,
          limit: Number(limit)
        }
      );

      res.json({
        results,
        total: results.length,
        query
      });
    } catch (error) {
      logger.error('Global search error:', error);
      res.status(500).json({ 
        error: 'Search failed', 
        message: error instanceof Error ? ((error as any)?.message || String(error)) : 'Unknown error' 
      });
    }
  },

  async getSuggestions(req: Request, res: Response) {
    try {
      const { q: query } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.json({ suggestions: [] });
      }

      const suggestions = await searchService.getSuggestions(
        query,
        req.user!.id
      );

      res.json({ suggestions });
    } catch (error) {
      logger.error('Search suggestions error:', error);
      res.json({ suggestions: [] });
    }
  },

  async getRecentSearches(req: Request, res: Response) {
    try {
      const searches = await searchService.getRecentSearches(req.user!.id);
      res.json({ searches });
    } catch (error) {
      logger.error('Recent searches error:', error);
      res.json({ searches: [] });
    }
  }
};