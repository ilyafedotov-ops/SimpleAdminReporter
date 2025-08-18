import { body } from 'express-validator';

/**
 * Validation rules for authentication endpoints
 */

export const loginValidation = [
  body('username')
    .isString()
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('password')
    .isString()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 1, max: 100 }).withMessage('Password too long'),
  body('authSource')
    .optional()
    .isIn(['ad', 'azure', 'o365', 'local']).withMessage('Invalid authentication source')
];

export const createUserValidation = [
  body('username')
    .isString()
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Username can only contain letters, numbers, dots, underscores, and hyphens'),
  body('password')
    .isString()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8, max: 100 }).withMessage('Password must be at least 8 characters'),
  body('displayName')
    .isString()
    .trim()
    .notEmpty().withMessage('Display name is required')
    .isLength({ min: 1, max: 100 }).withMessage('Display name must be 1-100 characters'),
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('isAdmin')
    .optional()
    .isBoolean().withMessage('isAdmin must be a boolean')
];

export const changePasswordValidation = [
  body('currentPassword')
    .isString()
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isString()
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8, max: 100 }).withMessage('New password must be at least 8 characters')
    .custom((value, { req }) => value !== req.body.currentPassword)
    .withMessage('New password must be different from current password')
];