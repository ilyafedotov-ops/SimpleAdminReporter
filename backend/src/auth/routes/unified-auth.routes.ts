import { Router } from 'express';
import { body } from 'express-validator';
import { unifiedAuthController } from '../controllers/unified-auth.controller';
import { azureAuthController } from '../controllers/azure-auth.controller';
import { requireAuth, optionalAuth, requireCSRF } from '../middleware/unified-auth.middleware';

const router = Router();

// Validation rules
const loginValidation = [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('authSource').optional().isIn(['ad', 'azure', 'o365', 'local']).withMessage('Invalid auth source')
];

const updateProfileValidation = [
  body('displayName').optional().isString().isLength({ min: 1, max: 100 }),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('department').optional().isString().isLength({ max: 100 }),
  body('title').optional().isString().isLength({ max: 100 })
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number and special character')
];

// Public routes (no auth required)
router.post('/login', loginValidation, unifiedAuthController.login);
router.post('/refresh', requireCSRF, unifiedAuthController.refresh);
router.get('/csrf', unifiedAuthController.getCSRFToken);

// Protected routes (auth required)
router.post('/logout', optionalAuth, unifiedAuthController.logout);
router.post('/logout-all', requireAuth, unifiedAuthController.logoutAll);
router.get('/profile', requireAuth, unifiedAuthController.getProfile);
router.put('/profile', requireAuth, requireCSRF, updateProfileValidation, unifiedAuthController.updateProfile);
router.post('/change-password', requireAuth, requireCSRF, changePasswordValidation, unifiedAuthController.changePassword);
router.get('/verify', requireAuth, unifiedAuthController.verify);

// Azure AD OAuth routes
router.get('/azure/config', requireAuth, azureAuthController.getAzurePublicConfig);
router.get('/azure/auth-url', requireAuth, azureAuthController.generateAuthUrl);
router.post('/azure/token', requireAuth, azureAuthController.exchangeToken);
router.post('/azure/store-token', requireAuth, azureAuthController.storeToken);
router.get('/azure/userinfo', requireAuth, azureAuthController.getAzureUserInfo);

export default router;