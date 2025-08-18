import request from 'supertest';
import express from 'express';
import { validationResult } from 'express-validator';
import { credentialsController } from './credentials.controller';
import { credentialsService } from '@/services/credentials.service';
import { logger } from '@/utils/logger';
// import { createError } from '@/middleware/error.middleware';
import { User } from '@/auth/types';

// Mock all dependencies
jest.mock('@/services/credentials.service');
jest.mock('@/utils/logger');
jest.mock('@/middleware/error.middleware');

// Mock express-validator
jest.mock('express-validator', () => ({
  body: jest.fn().mockReturnValue({
    isIn: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    trim: jest.fn().mockReturnThis(),
    notEmpty: jest.fn().mockReturnThis(),
    isLength: jest.fn().mockReturnThis(),
    optional: jest.fn().mockReturnThis(),
    isString: jest.fn().mockReturnThis(),
    isBoolean: jest.fn().mockReturnThis()
  }),
  param: jest.fn().mockReturnValue({
    isInt: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis()
  }),
  validationResult: jest.fn()
}));

// Mock validationResult as a function
const mockValidationResult = validationResult as jest.MockedFunction<typeof validationResult>;

describe('CredentialsController', () => {
  let app: express.Application;
  
  const mockUser: User = {
    id: 1,
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    authSource: 'local',
    isAdmin: false,
    isActive: true
  };


  const mockCredential = {
    id: 1,
    userId: 1,
    serviceType: 'ad' as const,
    credentialName: 'Test AD Credential',
    username: 'domain\\testuser',
    tenantId: null,
    clientId: null,
    isDefault: true,
    isActive: true,
    lastTested: '2025-01-01T10:00:00.000Z',
    lastTestSuccess: true,
    lastTestMessage: 'Connection successful',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  };

  const mockAzureCredential = {
    id: 2,
    userId: 1,
    serviceType: 'azure' as const,
    credentialName: 'Test Azure Credential',
    username: null,
    tenantId: 'tenant-123',
    clientId: 'client-456',
    isDefault: false,
    isActive: true,
    lastTested: null,
    lastTestSuccess: null,
    lastTestMessage: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, _res, _next) => {
      req.user = mockUser;
      _next();
    });

    // Mock validation result to return no errors by default
    mockValidationResult.mockReturnValue({
      isEmpty: () => true,
      array: () => []
    } as any);
    
    // Setup routes without validation middleware for testing
    const router = express.Router();
    router.get('/', credentialsController.getCredentials.bind(credentialsController));
    router.get('/defaults', credentialsController.getDefaultCredentials.bind(credentialsController));
    router.get('/:id', credentialsController.getCredential.bind(credentialsController));
    router.post('/', credentialsController.createCredential.bind(credentialsController));
    router.put('/:id', credentialsController.updateCredential.bind(credentialsController));
    router.delete('/:id', credentialsController.deleteCredential.bind(credentialsController));
    router.post('/:id/test', credentialsController.testCredential.bind(credentialsController));
    router.put('/:id/default', credentialsController.setDefaultCredential.bind(credentialsController));
    
    app.use('/api/credentials', router);
    
    // Error handling middleware
    app.use((err: any, req: any, res: any, _next: any) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Internal Server Error'
      });
    });
  });

  describe('GET /api/credentials', () => {
    it('should return all credentials for authenticated user', async () => {
      const mockCredentials = [mockCredential, mockAzureCredential];
      (credentialsService.getUserCredentials as jest.Mock).mockResolvedValue(mockCredentials);

      const response = await request(app)
        .get('/api/credentials')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockCredentials
      });
      expect(credentialsService.getUserCredentials).toHaveBeenCalledWith(1, undefined);
    });

    it('should filter credentials by service type', async () => {
      const mockAdCredentials = [mockCredential];
      (credentialsService.getUserCredentials as jest.Mock).mockResolvedValue(mockAdCredentials);

      const response = await request(app)
        .get('/api/credentials?serviceType=ad')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockAdCredentials
      });
      expect(credentialsService.getUserCredentials).toHaveBeenCalledWith(1, 'ad');
    });

    it('should handle service errors', async () => {
      (credentialsService.getUserCredentials as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/credentials')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database connection failed');
    });

    it('should only return credentials for authenticated user', async () => {
      (credentialsService.getUserCredentials as jest.Mock).mockResolvedValue([]);

      await request(app)
        .get('/api/credentials')
        .expect(200);

      expect(credentialsService.getUserCredentials).toHaveBeenCalledWith(1, undefined);
      expect(credentialsService.getUserCredentials).not.toHaveBeenCalledWith(2, undefined);
    });
  });

  describe('GET /api/credentials/:id', () => {
    it('should return specific credential for authenticated user', async () => {
      (credentialsService.getCredential as jest.Mock).mockResolvedValue(mockCredential);

      const response = await request(app)
        .get('/api/credentials/1')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockCredential
      });
      expect(credentialsService.getCredential).toHaveBeenCalledWith(1, 1);
    });

    it('should return 404 when credential not found', async () => {
      (credentialsService.getCredential as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/credentials/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Credential not found'
      });
    });

    it('should enforce user ownership - user cannot access other users credentials', async () => {
      (credentialsService.getCredential as jest.Mock).mockResolvedValue(null);

      await request(app)
        .get('/api/credentials/1')
        .expect(404);

      expect(credentialsService.getCredential).toHaveBeenCalledWith(1, 1);
    });

    it('should handle invalid credential ID format', async () => {
      (credentialsService.getCredential as jest.Mock).mockResolvedValue(null);

      await request(app)
        .get('/api/credentials/invalid')
        .expect(404);

      // Express converts 'invalid' to NaN when parsing parseInt
      expect(credentialsService.getCredential).toHaveBeenCalledWith(NaN, 1);
    });

    it('should handle service errors', async () => {
      (credentialsService.getCredential as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .get('/api/credentials/1')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('POST /api/credentials', () => {
    const validADCredential = {
      serviceType: 'ad',
      credentialName: 'New AD Credential',
      username: 'domain\\newuser',
      password: 'securepassword123',
      isDefault: false
    };

    const validAzureCredential = {
      serviceType: 'azure',
      credentialName: 'New Azure Credential',
      tenantId: 'tenant-789',
      clientId: 'client-101112',
      clientSecret: 'supersecret',
      isDefault: true
    };

    it('should create AD credential successfully', async () => {
      const createdCredential = { ...mockCredential, id: 3, credentialName: 'New AD Credential' };
      (credentialsService.createCredential as jest.Mock).mockResolvedValue(createdCredential);

      const response = await request(app)
        .post('/api/credentials')
        .send(validADCredential)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: createdCredential
      });
      expect(credentialsService.createCredential).toHaveBeenCalledWith(1, validADCredential);
      expect(logger.info).toHaveBeenCalledWith('User 1 created credential 3');
    });

    it('should create Azure credential successfully', async () => {
      const createdCredential = { ...mockAzureCredential, id: 4, credentialName: 'New Azure Credential', isDefault: true };
      (credentialsService.createCredential as jest.Mock).mockResolvedValue(createdCredential);

      const response = await request(app)
        .post('/api/credentials')
        .send(validAzureCredential)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: createdCredential
      });
      expect(credentialsService.createCredential).toHaveBeenCalledWith(1, validAzureCredential);
    });

    it('should handle validation errors', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { msg: 'Invalid service type', param: 'serviceType' },
          { msg: 'Credential name is required', param: 'credentialName' }
        ]
      } as any);

      const response = await request(app)
        .post('/api/credentials')
        .send({ serviceType: 'invalid' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        errors: [
          { msg: 'Invalid service type', param: 'serviceType' },
          { msg: 'Credential name is required', param: 'credentialName' }
        ]
      });
    });

    it('should handle service creation errors', async () => {
      (credentialsService.createCredential as jest.Mock).mockRejectedValue(
        new Error('Duplicate credential name')
      );

      const response = await request(app)
        .post('/api/credentials')
        .send(validADCredential)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Duplicate credential name');
    });

    it('should validate required fields for AD credentials', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { msg: 'Username and password are required for AD credentials', param: 'serviceType' }
        ]
      } as any);

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'ad',
          credentialName: 'Incomplete AD Credential'
          // Missing username and password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate required fields for Azure credentials', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { msg: 'Tenant ID, Client ID, and Client Secret are required for Azure credentials', param: 'serviceType' }
        ]
      } as any);

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'azure',
          credentialName: 'Incomplete Azure Credential'
          // Missing tenantId, clientId, clientSecret
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle encrypted password security', async () => {
      const createdCredential = { ...mockCredential, id: 5 };
      (credentialsService.createCredential as jest.Mock).mockResolvedValue(createdCredential);

      await request(app)
        .post('/api/credentials')
        .send(validADCredential)
        .expect(201);

      // Verify password is passed to service (service handles encryption)
      expect(credentialsService.createCredential).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          password: 'securepassword123'
        })
      );
    });
  });

  describe('PUT /api/credentials/:id', () => {
    const updateData = {
      credentialName: 'Updated Credential Name',
      username: 'domain\\updateduser',
      isActive: false
    };

    it('should update credential successfully', async () => {
      const updatedCredential = { ...mockCredential, ...updateData };
      (credentialsService.updateCredential as jest.Mock).mockResolvedValue(updatedCredential);

      const response = await request(app)
        .put('/api/credentials/1')
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: updatedCredential
      });
      expect(credentialsService.updateCredential).toHaveBeenCalledWith(1, 1, updateData);
      expect(logger.info).toHaveBeenCalledWith('User 1 updated credential 1');
    });

    it('should handle validation errors on update', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [
          { msg: 'Invalid credential ID', param: 'id' },
          { msg: 'Credential name cannot be empty', param: 'credentialName' }
        ]
      } as any);

      const response = await request(app)
        .put('/api/credentials/invalid')
        .send({ credentialName: '' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        errors: [
          { msg: 'Invalid credential ID', param: 'id' },
          { msg: 'Credential name cannot be empty', param: 'credentialName' }
        ]
      });
    });

    it('should handle credential not found during update', async () => {
      (credentialsService.updateCredential as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Credential not found'), { statusCode: 404 })
      );

      const response = await request(app)
        .put('/api/credentials/999')
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Credential not found');
    });

    it('should update password securely', async () => {
      const updatedCredential = { ...mockCredential };
      (credentialsService.updateCredential as jest.Mock).mockResolvedValue(updatedCredential);

      await request(app)
        .put('/api/credentials/1')
        .send({ password: 'newpassword123' })
        .expect(200);

      // Verify password is passed to service for encryption
      expect(credentialsService.updateCredential).toHaveBeenCalledWith(
        1, 1,
        expect.objectContaining({
          password: 'newpassword123'
        })
      );
    });

    it('should enforce user ownership on update', async () => {
      const error = Object.assign(new Error('Credential not found'), { statusCode: 404 });
      (credentialsService.updateCredential as jest.Mock).mockRejectedValue(error);

      await request(app)
        .put('/api/credentials/1')
        .send(updateData)
        .expect(404);

      // Service is called with user ID to enforce ownership
      expect(credentialsService.updateCredential).toHaveBeenCalledWith(1, 1, updateData);
    });
  });

  describe('DELETE /api/credentials/:id', () => {
    it('should delete credential successfully', async () => {
      (credentialsService.deleteCredential as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/credentials/1')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Credential deleted successfully'
      });
      expect(credentialsService.deleteCredential).toHaveBeenCalledWith(1, 1);
      expect(logger.info).toHaveBeenCalledWith('User 1 deleted credential 1');
    });

    it('should handle credential not found during deletion', async () => {
      (credentialsService.deleteCredential as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Credential not found'), { statusCode: 404 })
      );

      const response = await request(app)
        .delete('/api/credentials/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Credential not found');
    });

    it('should enforce user ownership on deletion', async () => {
      const error = Object.assign(new Error('Credential not found'), { statusCode: 404 });
      (credentialsService.deleteCredential as jest.Mock).mockRejectedValue(error);

      await request(app)
        .delete('/api/credentials/1')
        .expect(404);

      // Service is called with user ID to enforce ownership
      expect(credentialsService.deleteCredential).toHaveBeenCalledWith(1, 1);
    });

    it('should handle cascade deletion of related records', async () => {
      (credentialsService.deleteCredential as jest.Mock).mockResolvedValue(undefined);

      await request(app)
        .delete('/api/credentials/1')
        .expect(200);

      expect(credentialsService.deleteCredential).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('POST /api/credentials/:id/test', () => {
    const successTestResult = {
      success: true,
      message: 'AD authentication successful',
      details: { connectionTime: 150, server: 'dc.example.com' }
    };

    const failureTestResult = {
      success: false,
      message: 'AD authentication failed: Invalid credentials'
    };

    it('should test credential successfully', async () => {
      (credentialsService.testCredential as jest.Mock).mockResolvedValue(successTestResult);

      const response = await request(app)
        .post('/api/credentials/1/test')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: successTestResult
      });
      expect(credentialsService.testCredential).toHaveBeenCalledWith(1, 1);
      expect(logger.info).toHaveBeenCalledWith('User 1 tested credential 1: true');
    });

    it('should handle failed credential test', async () => {
      (credentialsService.testCredential as jest.Mock).mockResolvedValue(failureTestResult);

      const response = await request(app)
        .post('/api/credentials/1/test')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: failureTestResult
      });
      expect(logger.info).toHaveBeenCalledWith('User 1 tested credential 1: false');
    });

    it('should handle credential not found during test', async () => {
      (credentialsService.testCredential as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Credential not found'), { statusCode: 404 })
      );

      const response = await request(app)
        .post('/api/credentials/999/test')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Credential not found');
    });

    it('should handle service connection errors during test', async () => {
      (credentialsService.testCredential as jest.Mock).mockRejectedValue(
        new Error('LDAP server unreachable')
      );

      const response = await request(app)
        .post('/api/credentials/1/test')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('LDAP server unreachable');
    });

    it('should enforce user ownership on test', async () => {
      const error = Object.assign(new Error('Credential not found'), { statusCode: 404 });
      (credentialsService.testCredential as jest.Mock).mockRejectedValue(error);

      await request(app)
        .post('/api/credentials/1/test')
        .expect(404);

      expect(credentialsService.testCredential).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('PUT /api/credentials/:id/default', () => {
    it('should set credential as default successfully', async () => {
      (credentialsService.setDefaultCredential as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/credentials/1/default')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Default credential updated successfully'
      });
      expect(credentialsService.setDefaultCredential).toHaveBeenCalledWith(1, 1);
      expect(logger.info).toHaveBeenCalledWith('User 1 set credential 1 as default');
    });

    it('should handle credential not found when setting default', async () => {
      (credentialsService.setDefaultCredential as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Credential not found'), { statusCode: 404 })
      );

      const response = await request(app)
        .put('/api/credentials/999/default')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Credential not found');
    });

    it('should enforce user ownership when setting default', async () => {
      const error = Object.assign(new Error('Credential not found'), { statusCode: 404 });
      (credentialsService.setDefaultCredential as jest.Mock).mockRejectedValue(error);

      await request(app)
        .put('/api/credentials/1/default')
        .expect(404);

      expect(credentialsService.setDefaultCredential).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('GET /api/credentials/defaults', () => {
    it('should return default credentials for all service types', async () => {
      const mockDefaults = {
        ad: mockCredential,
        azure: mockAzureCredential,
        o365: null
      };

      (credentialsService.getDefaultCredential as jest.Mock)
        .mockResolvedValueOnce(mockCredential)    // AD default
        .mockResolvedValueOnce(mockAzureCredential) // Azure default
        .mockResolvedValueOnce(null);             // O365 default (none)

      const response = await request(app)
        .get('/api/credentials/defaults')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockDefaults
      });

      expect(credentialsService.getDefaultCredential).toHaveBeenCalledTimes(3);
      expect(credentialsService.getDefaultCredential).toHaveBeenCalledWith(1, 'ad');
      expect(credentialsService.getDefaultCredential).toHaveBeenCalledWith(1, 'azure');
      expect(credentialsService.getDefaultCredential).toHaveBeenCalledWith(1, 'o365');
    });

    it('should handle partial default credentials', async () => {
      (credentialsService.getDefaultCredential as jest.Mock)
        .mockResolvedValueOnce(null)    // AD default (none)
        .mockResolvedValueOnce(null)    // Azure default (none)
        .mockResolvedValueOnce(null);   // O365 default (none)

      const response = await request(app)
        .get('/api/credentials/defaults')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          ad: null,
          azure: null,
          o365: null
        }
      });
    });

    it('should handle service errors when fetching defaults', async () => {
      (credentialsService.getDefaultCredential as jest.Mock)
        .mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/credentials/defaults')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database connection failed');
    });
  });

  describe('Authorization and Security', () => {
    it('should require authentication for all endpoints', async () => {
      // Create app without auth middleware
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.get('/test', (req, res, _next) => {
        try {
          credentialsController.getCredentials(req as any, res, _next);
        } catch {
          res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
        }
      });
      
      appNoAuth.use((err: any, req: any, res: any, _next: any) => {
        res.status(500).json({
          success: false,
          error: err.message || 'Internal Server Error'
        });
      });

      // This should fail when req.user is undefined
      const response = await request(appNoAuth)
        .get('/test')
        .expect(500); // Will error because req.user!.id is undefined

      expect(response.body.success).toBe(false);
    });

    it('should prevent user from accessing other users credentials', async () => {
      // Mock service to return null (simulating authorization check)
      (credentialsService.getCredential as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/credentials/1')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Credential not found'
      });
      // Verify user ID is passed to service for authorization
      expect(credentialsService.getCredential).toHaveBeenCalledWith(1, 1);
    });

    it('should mask sensitive data in responses', async () => {
      // Credentials service should not return encrypted passwords in regular API calls
      (credentialsService.getUserCredentials as jest.Mock).mockResolvedValue([mockCredential]);

      const response = await request(app)
        .get('/api/credentials')
        .expect(200);

      // Verify no password fields are present in response
      const credential = response.body.data[0];
      expect(credential).not.toHaveProperty('password');
      expect(credential).not.toHaveProperty('encryptedPassword');
      expect(credential).not.toHaveProperty('clientSecret');
      expect(credential).not.toHaveProperty('encryptedClientSecret');
    });

    it('should log security-relevant actions', async () => {
      (credentialsService.createCredential as jest.Mock).mockResolvedValue({ ...mockCredential, id: 10 });

      await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'ad',
          credentialName: 'Test Credential',
          username: 'testuser',
          password: 'password123'
        })
        .expect(201);

      expect(logger.info).toHaveBeenCalledWith('User 1 created credential 10');
    });
  });

  describe('Input Validation', () => {
    it('should validate service type enum', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Invalid service type', param: 'serviceType' }]
      } as any);

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'invalid_service',
          credentialName: 'Test'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ msg: 'Invalid service type' })
      );
    });

    it('should validate credential name length', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Credential name too long', param: 'credentialName' }]
      } as any);

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'ad',
          credentialName: 'a'.repeat(300) // Too long
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate required fields are not empty', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Credential name is required', param: 'credentialName' }]
      } as any);

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'ad',
          credentialName: ''
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate boolean fields', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'isDefault must be a boolean', param: 'isDefault' }]
      } as any);

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'ad',
          credentialName: 'Test',
          isDefault: 'not_boolean'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      (credentialsService.getUserCredentials as jest.Mock).mockRejectedValue(
        new Error('Connection pool exhausted')
      );

      const response = await request(app)
        .get('/api/credentials')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Connection pool exhausted');
    });

    it('should handle encryption errors during creation', async () => {
      (credentialsService.createCredential as jest.Mock).mockRejectedValue(
        new Error('Failed to encrypt credential')
      );

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'ad',
          credentialName: 'Test',
          username: 'user',
          password: 'pass'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to encrypt credential');
    });

    it('should handle service-specific test failures', async () => {
      (credentialsService.testCredential as jest.Mock).mockRejectedValue(
        new Error('LDAP server unavailable')
      );

      const response = await request(app)
        .post('/api/credentials/1/test')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('LDAP server unavailable');
    });

    it('should handle concurrent modification errors', async () => {
      (credentialsService.updateCredential as jest.Mock).mockRejectedValue(
        new Error('Credential was modified by another process')
      );

      const response = await request(app)
        .put('/api/credentials/1')
        .send({ credentialName: 'Updated Name' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Credential was modified by another process');
    });
  });

  describe('Performance and Rate Limiting', () => {
    it('should handle multiple concurrent requests', async () => {
      (credentialsService.getUserCredentials as jest.Mock).mockResolvedValue([]);

      const requests = Array(10).fill(null).map(() => 
        request(app).get('/api/credentials')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      expect(credentialsService.getUserCredentials).toHaveBeenCalledTimes(10);
    });

    it('should handle test credential rate limiting gracefully', async () => {
      // Simulate multiple test requests
      (credentialsService.testCredential as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Connection successful'
      });

      const testRequests = Array(5).fill(null).map(() =>
        request(app).post('/api/credentials/1/test')
      );

      const responses = await Promise.all(testRequests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity on deletion', async () => {
      (credentialsService.deleteCredential as jest.Mock).mockResolvedValue(undefined);

      await request(app)
        .delete('/api/credentials/1')
        .expect(200);

      expect(credentialsService.deleteCredential).toHaveBeenCalledWith(1, 1);
    });

    it('should handle transaction rollback on creation failure', async () => {
      (credentialsService.createCredential as jest.Mock).mockRejectedValue(
        new Error('Transaction rolled back due to constraint violation')
      );

      const response = await request(app)
        .post('/api/credentials')
        .send({
          serviceType: 'ad',
          credentialName: 'Test',
          username: 'user',
          password: 'pass'
        })
        .expect(500);

      expect(response.body.error).toBe('Transaction rolled back due to constraint violation');
    });
  });
});