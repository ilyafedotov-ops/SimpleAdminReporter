import { Router } from 'express';
import { 
  credentialsController, 
  createCredentialValidation, 
  updateCredentialValidation,
  credentialIdValidation 
} from '@/controllers/credentials.controller';
import { requireAuth, auditAction, userRateLimit } from '@/middleware/auth-wrapper';

const router = Router();

/**
 * Service Credentials Routes
 * Base path: /api/credentials
 * All routes require authentication
 */

// Apply authentication to all routes
router.use(requireAuth);

/**
 * @route   GET /api/credentials
 * @desc    Get all credentials for the authenticated user
 * @access  Private
 * @query   serviceType - Optional filter by service type (ad, azure, o365)
 */
router.get('/',
  auditAction('list_credentials', 'credentials'),
  credentialsController.getCredentials
);

/**
 * @route   GET /api/credentials/defaults
 * @desc    Get default credentials for all service types
 * @access  Private
 */
router.get('/defaults',
  auditAction('list_default_credentials', 'credentials'),
  credentialsController.getDefaultCredentials
);

/**
 * @route   GET /api/credentials/:id
 * @desc    Get a specific credential
 * @access  Private
 */
router.get('/:id',
  credentialIdValidation,
  auditAction('view_credential', 'credentials'),
  credentialsController.getCredential
);

/**
 * @route   POST /api/credentials
 * @desc    Create a new credential
 * @access  Private
 * @body    { serviceType, credentialName, username?, password?, tenantId?, clientId?, clientSecret?, isDefault? }
 */
router.post('/',
  userRateLimit(20), // 20 credential creations per minute
  createCredentialValidation,
  auditAction('create_credential', 'credentials'),
  credentialsController.createCredential
);

/**
 * @route   PUT /api/credentials/:id
 * @desc    Update a credential
 * @access  Private
 * @body    { credentialName?, username?, password?, tenantId?, clientId?, clientSecret?, isDefault?, isActive? }
 */
router.put('/:id',
  updateCredentialValidation,
  auditAction('update_credential', 'credentials'),
  credentialsController.updateCredential
);

/**
 * @route   DELETE /api/credentials/:id
 * @desc    Delete a credential
 * @access  Private
 */
router.delete('/:id',
  credentialIdValidation,
  auditAction('delete_credential', 'credentials'),
  credentialsController.deleteCredential
);

/**
 * @route   POST /api/credentials/:id/test
 * @desc    Test a credential connection
 * @access  Private
 */
router.post('/:id/test',
  userRateLimit(30), // 30 tests per minute
  credentialIdValidation,
  auditAction('test_credential', 'credentials'),
  credentialsController.testCredential
);

/**
 * @route   PUT /api/credentials/:id/set-default
 * @desc    Set a credential as default for its service type
 * @access  Private
 */
router.put('/:id/set-default',
  credentialIdValidation,
  auditAction('set_default_credential', 'credentials'),
  credentialsController.setDefaultCredential
);

export default router;