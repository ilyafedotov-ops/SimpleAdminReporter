import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { credentialsService } from '@/services/credentials.service';
import { logger } from '@/utils/logger';

// Validation rules
export const createCredentialValidation = [
  body('serviceType')
    .isIn(['ad', 'azure', 'o365'])
    .withMessage('Invalid service type'),
  body('credentialName')
    .trim()
    .notEmpty()
    .withMessage('Credential name is required')
    .isLength({ max: 255 })
    .withMessage('Credential name too long'),
  body('username')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Username too long'),
  body('password')
    .optional()
    .isString()
    .withMessage('Password must be a string'),
  body('tenantId')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Tenant ID too long'),
  body('clientId')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Client ID too long'),
  body('clientSecret')
    .optional()
    .isString()
    .withMessage('Client secret must be a string'),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean')
];

export const updateCredentialValidation = [
  param('id')
    .isInt()
    .withMessage('Invalid credential ID'),
  body('credentialName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Credential name cannot be empty')
    .isLength({ max: 255 })
    .withMessage('Credential name too long'),
  body('username')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Username too long'),
  body('password')
    .optional()
    .isString()
    .withMessage('Password must be a string'),
  body('tenantId')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Tenant ID too long'),
  body('clientId')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Client ID too long'),
  body('clientSecret')
    .optional()
    .isString()
    .withMessage('Client secret must be a string'),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

export const credentialIdValidation = [
  param('id')
    .isInt()
    .withMessage('Invalid credential ID')
];

class CredentialsController {
  /**
   * Get all credentials for the authenticated user
   */
  async getCredentials(req: Request, res: Response, _next: NextFunction) {
    try {
      const userId = req.user!.id;
      const serviceType = req.query.serviceType as string | undefined;

      const credentials = await credentialsService.getUserCredentials(userId, serviceType);
      
      res.json({
        success: true,
        data: credentials
      });
    } catch (error) {
      _next(error);
    }
  }

  /**
   * Get a specific credential
   */
  async getCredential(req: Request, res: Response, _next: NextFunction) {
    try {
      const userId = req.user!.id;
      const credentialId = parseInt(req.params.id);

      const credential = await credentialsService.getCredential(credentialId, userId);
      
      if (!credential) {
        return res.status(404).json({
          success: false,
          error: 'Credential not found'
        });
      }

      res.json({
        success: true,
        data: credential
      });
    } catch (error) {
      _next(error);
    }
  }

  /**
   * Create a new credential
   */
  async createCredential(req: Request, res: Response, _next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const userId = req.user!.id;
      const credential = await credentialsService.createCredential(userId, req.body);
      
      logger.info(`User ${userId} created credential ${credential.id}`);
      
      res.status(201).json({
        success: true,
        data: credential
      });
    } catch (error) {
      _next(error);
    }
  }

  /**
   * Update a credential
   */
  async updateCredential(req: Request, res: Response, _next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const userId = req.user!.id;
      const credentialId = parseInt(req.params.id);

      const credential = await credentialsService.updateCredential(
        credentialId, 
        userId, 
        req.body
      );
      
      logger.info(`User ${userId} updated credential ${credentialId}`);
      
      res.json({
        success: true,
        data: credential
      });
    } catch (error) {
      _next(error);
    }
  }

  /**
   * Delete a credential
   */
  async deleteCredential(req: Request, res: Response, _next: NextFunction) {
    try {
      const userId = req.user!.id;
      const credentialId = parseInt(req.params.id);

      await credentialsService.deleteCredential(credentialId, userId);
      
      logger.info(`User ${userId} deleted credential ${credentialId}`);
      
      res.json({
        success: true,
        message: 'Credential deleted successfully'
      });
    } catch (error) {
      _next(error);
    }
  }

  /**
   * Test a credential
   */
  async testCredential(req: Request, res: Response, _next: NextFunction) {
    try {
      const userId = req.user!.id;
      const credentialId = parseInt(req.params.id);

      const result = await credentialsService.testCredential(credentialId, userId);
      
      logger.info(`User ${userId} tested credential ${credentialId}: ${result.success}`);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      _next(error);
    }
  }

  /**
   * Set a credential as default
   */
  async setDefaultCredential(req: Request, res: Response, _next: NextFunction) {
    try {
      const userId = req.user!.id;
      const credentialId = parseInt(req.params.id);

      await credentialsService.setDefaultCredential(credentialId, userId);
      
      logger.info(`User ${userId} set credential ${credentialId} as default`);
      
      res.json({
        success: true,
        message: 'Default credential updated successfully'
      });
    } catch (error) {
      _next(error);
    }
  }

  /**
   * Get default credentials for all service types
   */
  async getDefaultCredentials(req: Request, res: Response, _next: NextFunction) {
    try {
      const userId = req.user!.id;
      
      const [adDefault, azureDefault, o365Default] = await Promise.all([
        credentialsService.getDefaultCredential(userId, 'ad'),
        credentialsService.getDefaultCredential(userId, 'azure'),
        credentialsService.getDefaultCredential(userId, 'o365')
      ]);

      res.json({
        success: true,
        data: {
          ad: adDefault,
          azure: azureDefault,
          o365: o365Default
        }
      });
    } catch (error) {
      _next(error);
    }
  }
}

export const credentialsController = new CredentialsController();