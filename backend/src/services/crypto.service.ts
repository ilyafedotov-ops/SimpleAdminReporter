import crypto from 'crypto';
import { logger } from '@/utils/logger';

export interface EncryptedData {
  encrypted: string;
  salt: string;
  iv: string;
  authTag: string;
  version: string;
}

export class CryptoService {
  private algorithm = 'aes-256-gcm';
  private keyDerivationIterations = 100000;
  private keyLength = 32; // 256 bits
  
  constructor(private masterKey?: string) {
    this.masterKey = masterKey || process.env.ENCRYPTION_KEY;
    if (!this.masterKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    // Validate key format
    if (Buffer.from(this.masterKey, 'base64').length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 bytes when base64 decoded');
    }
  }

  /**
   * Derive a key from the master key and salt
   */
  private async deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(masterKey, salt, this.keyDerivationIterations, this.keyLength, 'sha256', (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(derivedKey);
        }
      });
    });
  }

  /**
   * Encrypt a token with AES-256-GCM
   */
  async encryptToken(token: string, userId: number): Promise<EncryptedData> {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      
      // Derive key from master key and salt
      const key = await this.deriveKey(this.masterKey!, salt);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Add additional authenticated data (AAD)
      const aad = Buffer.from(`user:${userId}`);
      (cipher as any).setAAD(aad);
      
      // Encrypt the token
      const encrypted = Buffer.concat([
        cipher.update(token, 'utf8'),
        cipher.final()
      ]);
      
      // Get authentication tag
      const authTag = (cipher as any).getAuthTag();
      
      return {
        encrypted: encrypted.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        version: 'v2'
      };
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt token');
    }
  }

  /**
   * Decrypt a token
   */
  async decryptToken(encryptedData: EncryptedData, userId: number): Promise<string> {
    try {
      // Validate version
      if (encryptedData.version !== 'v2') {
        throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
      }
      
      // Decode from base64
      const salt = Buffer.from(encryptedData.salt, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      const encrypted = Buffer.from(encryptedData.encrypted, 'base64');
      
      // Derive key
      const key = await this.deriveKey(this.masterKey!, salt);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      
      // Set authentication tag
      (decipher as any).setAuthTag(authTag);
      
      // Add additional authenticated data (AAD)
      const aad = Buffer.from(`user:${userId}`);
      (decipher as any).setAAD(aad);
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt token');
    }
  }

  /**
   * Generate a secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Hash a value with SHA256
   */
  hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Generate PKCE code verifier
   */
  generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  generateCodeChallenge(verifier: string): string {
    return crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }

  /**
   * Validate PKCE code verifier against challenge
   */
  validatePKCE(verifier: string, challenge: string): boolean {
    const computedChallenge = this.generateCodeChallenge(verifier);
    return computedChallenge === challenge;
  }
}

// Export singleton instance
export const cryptoService = new CryptoService();