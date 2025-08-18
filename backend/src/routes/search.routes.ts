import { Router } from 'express';
import { searchController } from '../controllers/search.controller';
import { requireAuth } from '../auth/middleware/unified-auth.middleware';

const router = Router();

// All search routes require authentication
router.use(requireAuth);

// Global search endpoint
router.get('/global', searchController.globalSearch);

// Search suggestions
router.get('/suggestions', searchController.getSuggestions);

// Recent searches
router.get('/recent', searchController.getRecentSearches);

export default router;