import { CryptoService, cryptoService, EncryptedData } from './crypto.service';
import crypto from 'crypto';

// Mock crypto module
jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
  pbkdf2: jest.fn(),
  createCipheriv: jest.fn(),
  createDecipheriv: jest.fn(),
  createHash: jest.fn(),
  timingSafeEqual: jest.fn()
}));

// Mock logger
jest.mock('@/utils/logger');

describe('CryptoService', () => {
  let service: CryptoService;
  const mockMasterKey = Buffer.from('test-master-key-32-bytes-long-123').toString('base64');
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variable
    process.env.ENCRYPTION_KEY = mockMasterKey;
    
    // Create fresh service instance
    service = new CryptoService();
  });
  
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('Constructor', () => {
    it('should initialize with master key from environment', () => {
      expect(() => new CryptoService()).not.toThrow();
    });
    
    it('should throw error when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;
      
      expect(() => new CryptoService()).toThrow('ENCRYPTION_KEY environment variable is required');
    });
    
    it('should accept master key as constructor parameter', () => {
      const customKey = Buffer.from('custom-master-key-32-bytes-long-1').toString('base64');
      
      expect(() => new CryptoService(customKey)).not.toThrow();
    });
  });

  describe('encryptToken', () => {
    beforeEach(() => {
      // Mock crypto.randomBytes
      (crypto.randomBytes as jest.Mock)
        .mockReturnValueOnce(Buffer.from('mock-salt-32-bytes-long-12345678')) // salt
        .mockReturnValueOnce(Buffer.from('mock-iv-16-bytes-')); // iv
      
      // Mock pbkdf2
      (crypto.pbkdf2 as jest.Mock).mockImplementation((masterKey, salt, iterations, keyLength, digest, callback) => {
        callback(null, Buffer.from('derived-key-32-bytes-long-1234567'));
      });
      
      // Mock cipher
      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue(Buffer.from('encrypted-part-1')),
        final: jest.fn().mockReturnValue(Buffer.from('encrypted-part-2')),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('auth-tag-16-bytes'))
      };
      (crypto.createCipheriv as jest.Mock).mockReturnValue(mockCipher);
    });

    it('should encrypt token successfully', async () => {
      const token = 'test-access-token';
      const userId = 123;
      
      const result = await service.encryptToken(token, userId);
      
      expect(result).toEqual({
        encrypted: expect.any(String),
        salt: expect.any(String),
        iv: expect.any(String),
        authTag: expect.any(String),
        version: 'v2'
      });
      
      expect(crypto.randomBytes).toHaveBeenCalledWith(32); // salt
      expect(crypto.randomBytes).toHaveBeenCalledWith(16); // iv
      expect(crypto.pbkdf2).toHaveBeenCalled();
      expect(crypto.createCipheriv).toHaveBeenCalledWith('aes-256-gcm', expect.any(Buffer), expect.any(Buffer));
    });
  });

  describe('decryptToken', () => {
    beforeEach(() => {
      // Mock pbkdf2 for decryption
      (crypto.pbkdf2 as jest.Mock).mockImplementation((masterKey, salt, iterations, keyLength, digest, callback) => {
        callback(null, Buffer.from('derived-key-32-bytes-long-1234567'));
      });
      
      // Mock decipher
      const mockDecipher = {
        setAuthTag: jest.fn(),
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue(Buffer.from('decrypted-part')),
        final: jest.fn().mockReturnValue(Buffer.from('-final'))
      };
      (crypto.createDecipheriv as jest.Mock).mockReturnValue(mockDecipher);
    });

    it('should decrypt token successfully', async () => {
      const encryptedData: EncryptedData = {
        encrypted: Buffer.from('encrypted-data').toString('base64'),
        salt: Buffer.from('salt-32-bytes-long-123456789012').toString('base64'),
        iv: Buffer.from('iv-16-bytes-long').toString('base64'),
        authTag: Buffer.from('auth-tag-16-byte').toString('base64'),
        version: 'v2'
      };
      const userId = 123;
      
      const result = await service.decryptToken(encryptedData, userId);
      
      expect(result).toBe('decrypted-part-final');
      expect(crypto.pbkdf2).toHaveBeenCalled();
      expect(crypto.createDecipheriv).toHaveBeenCalledWith('aes-256-gcm', expect.any(Buffer), expect.any(Buffer));
    });
    
    it('should reject unsupported version', async () => {
      const encryptedData: EncryptedData = {
        encrypted: 'data',
        salt: 'salt',
        iv: 'iv',
        authTag: 'tag',
        version: 'v1'
      };
      
      // The implementation catches the error and throws a generic message
      await expect(service.decryptToken(encryptedData, 123))
        .rejects.toThrow('Failed to decrypt token');
    });
  });

  describe('generateSecureToken', () => {
    beforeEach(() => {
      (crypto.randomBytes as jest.Mock).mockReturnValue(Buffer.from('random-bytes-for-token'));
    });

    it('should generate token with default length', () => {
      const token = service.generateSecureToken();
      
      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(token).toBe(Buffer.from('random-bytes-for-token').toString('base64url'));
    });
    
    it('should generate token with custom length', () => {
      const customLength = 64;
      
      service.generateSecureToken(customLength);
      
      expect(crypto.randomBytes).toHaveBeenCalledWith(customLength);
    });
  });

  describe('hashValue', () => {
    beforeEach(() => {
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('mocked-hash-value')
      };
      (crypto.createHash as jest.Mock).mockReturnValue(mockHash);
    });

    it('should hash value with SHA256', () => {
      const value = 'test-value-to-hash';
      
      const result = service.hashValue(value);
      
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      expect(result).toBe('mocked-hash-value');
    });
  });

  describe('PKCE Methods', () => {
    beforeEach(() => {
      (crypto.randomBytes as jest.Mock).mockReturnValue(Buffer.from('random-pkce-bytes'));
      
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('mocked-challenge')
      };
      (crypto.createHash as jest.Mock).mockReturnValue(mockHash);
    });

    describe('generateCodeVerifier', () => {
      it('should generate PKCE code verifier', () => {
        const verifier = service.generateCodeVerifier();
        
        expect(crypto.randomBytes).toHaveBeenCalledWith(32);
        expect(verifier).toBe(Buffer.from('random-pkce-bytes').toString('base64url'));
      });
    });
    
    describe('generateCodeChallenge', () => {
      it('should generate PKCE code challenge from verifier', () => {
        const verifier = 'test-code-verifier';
        
        const challenge = service.generateCodeChallenge(verifier);
        
        expect(crypto.createHash).toHaveBeenCalledWith('sha256');
        expect(challenge).toBe('mocked-challenge');
      });
    });
    
    describe('validatePKCE', () => {
      it('should validate correct verifier against challenge', () => {
        const verifier = 'correct-verifier';
        const challenge = 'mocked-challenge';
        
        // Mock generateCodeChallenge to return the same challenge
        jest.spyOn(service, 'generateCodeChallenge').mockReturnValue(challenge);
        
        const result = service.validatePKCE(verifier, challenge);
        
        expect(result).toBe(true);
        expect(service.generateCodeChallenge).toHaveBeenCalledWith(verifier);
      });
      
      it('should reject incorrect verifier', () => {
        const verifier = 'wrong-verifier';
        const challenge = 'expected-challenge';
        
        // Mock generateCodeChallenge to return different challenge
        jest.spyOn(service, 'generateCodeChallenge').mockReturnValue('different-challenge');
        
        const result = service.validatePKCE(verifier, challenge);
        
        expect(result).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption errors', async () => {
      (crypto.pbkdf2 as jest.Mock).mockImplementation((masterKey, salt, iterations, keyLength, digest, callback) => {
        callback(new Error('Key derivation failed'), null);
      });
      
      await expect(service.encryptToken('token', 123))
        .rejects.toThrow('Failed to encrypt token');
    });
    
    it('should handle decryption errors', async () => {
      const encryptedData: EncryptedData = {
        encrypted: Buffer.from('data').toString('base64'),
        salt: Buffer.from('salt-32-bytes-long-123456789012').toString('base64'),
        iv: Buffer.from('iv-16-bytes-long').toString('base64'),
        authTag: Buffer.from('tag-16-bytes-long').toString('base64'),
        version: 'v2'
      };
      
      (crypto.pbkdf2 as jest.Mock).mockImplementation((masterKey, salt, iterations, keyLength, digest, callback) => {
        callback(new Error('Decryption failed'), null);
      });
      
      await expect(service.decryptToken(encryptedData, 123))
        .rejects.toThrow('Failed to decrypt token');
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(cryptoService).toBeInstanceOf(CryptoService);
    });
  });
});