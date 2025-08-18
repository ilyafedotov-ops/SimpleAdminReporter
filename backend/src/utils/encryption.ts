import crypto from 'crypto';
import { logger } from '@/utils/logger';

/**
 * Encryption utility for securing sensitive credentials
 * Uses AES-256-GCM for authenticated encryption
 */
export class CredentialEncryption {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits
  private ivLength = 16; // 128 bits
  private tagLength = 16; // 128 bits
  private saltLength = 32; // 256 bits
  private iterations = 100000; // PBKDF2 iterations
  
  private masterKey: Buffer;
  /**
   * Raw password taken from CREDENTIAL_ENCRYPTION_KEY. Storing it allows the
   * service to derive a fresh key for every ciphertext using the salt that is
   * embedded alongside the encrypted data (v1 format).
   */
  private encryptionPassword: string;

  constructor() {
    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    
    if (!encryptionKey) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is not set');
    }

    if (encryptionKey.length < 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters long');
    }

    // Keep the raw password so we can derive per-ciphertext keys later
    this.encryptionPassword = encryptionKey;

    // Derive a key from the provided password using PBKDF2 (legacy / global-salt mode)
    const salt = this.getOrCreateSalt();
    this.masterKey = crypto.pbkdf2Sync(encryptionKey, salt, this.iterations, this.keyLength, 'sha256');
    
    logger.info('Credential encryption service initialized');
  }

  /**
   * Get or create a persistent salt for key derivation
   * In production, this should be stored securely
   */
  private getOrCreateSalt(): Buffer {
    const saltEnv = process.env.CREDENTIAL_ENCRYPTION_SALT;
    
    if (saltEnv) {
      return Buffer.from(saltEnv, 'hex');
    }

    // Generate a new salt if not provided
    const newSalt = crypto.randomBytes(this.saltLength);
    logger.warn('Generated new encryption salt. Set CREDENTIAL_ENCRYPTION_SALT environment variable for persistence.');
    logger.info(`CREDENTIAL_ENCRYPTION_SALT=${newSalt.toString('hex')}`);
    return newSalt;
  }

  /**
   * Encrypt a plaintext credential.
   *
   * Format (v1): "v1:" + base64( salt | iv | authTag | ciphertext )
   *   salt       – 32 random bytes (per-credential)
   *   iv         – 16 random bytes (per-credential)
   *   authTag    – 16 bytes produced by AES-GCM
   *   ciphertext – encrypted UTF-8 bytes of the plaintext
   */
  encrypt(plaintext: string): string {
    try {
      // 1. Per-credential random salt & key derivation
      const salt = crypto.randomBytes(this.saltLength);
      const key = crypto.pbkdf2Sync(
        this.encryptionPassword,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );

      // 2. Per-credential random IV
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      // 3. Compose final payload: salt | iv | authTag | ciphertext
      const combined = Buffer.concat([salt, iv, authTag, encrypted]);

      // Prefix with version marker so we can distinguish formats later
      return `v1:${combined.toString('base64')}`;
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt credential');
    }
  }

  /**
   * Decrypt a credential string (handles both legacy and v1 formats).
   */
  decrypt(encryptedData: string): string {
    try {
      let combined: Buffer;
      let key: Buffer;
      let offset = 0;

      // Detect versioned payloads by prefix
      if (encryptedData.startsWith('v1:')) {
        // New format with embedded salt
        combined = Buffer.from(encryptedData.slice(3), 'base64');

        const salt = combined.slice(0, this.saltLength);
        offset += this.saltLength;

        key = crypto.pbkdf2Sync(
          this.encryptionPassword,
          salt,
          this.iterations,
          this.keyLength,
          'sha256'
        );
      } else {
        // Legacy format relies on global salt and masterKey
        combined = Buffer.from(encryptedData, 'base64');
        key = this.masterKey;
      }

      // Extract IV, tag, ciphertext
      const iv = combined.slice(offset, offset + this.ivLength);
      const authTag = combined.slice(
        offset + this.ivLength,
        offset + this.ivLength + this.tagLength,
      );
      const encrypted = combined.slice(offset + this.ivLength + this.tagLength);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt credential');
    }
  }

  /**
   * Extract the salt from v1 encrypted data
   * @param encryptedData The encrypted data
   * @returns The salt in hex format, or null if not v1 format
   */
  extractSalt(encryptedData: string): string | null {
    try {
      if (!encryptedData.startsWith('v1:')) {
        return null;
      }
      
      const combined = Buffer.from(encryptedData.slice(3), 'base64');
      const salt = combined.slice(0, this.saltLength);
      return salt.toString('hex');
    } catch (error) {
      logger.error('Failed to extract salt:', error);
      return null;
    }
  }

  /**
   * Decrypt legacy format using a specific salt
   * @param encryptedData The encrypted data (legacy format)
   * @param saltHex The salt in hex format
   * @returns Decrypted string
   */
  decryptWithSalt(encryptedData: string, saltHex: string): string {
    try {
      if (encryptedData.startsWith('v1:')) {
        // If it's already v1, use regular decrypt
        return this.decrypt(encryptedData);
      }
      
      const salt = Buffer.from(saltHex, 'hex');
      const key = crypto.pbkdf2Sync(
        this.encryptionPassword,
        salt,
        this.iterations,
        this.keyLength,
        'sha256'
      );
      
      const combined = Buffer.from(encryptedData, 'base64');
      const iv = combined.slice(0, this.ivLength);
      const authTag = combined.slice(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = combined.slice(this.ivLength + this.tagLength);
      
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption with salt failed:', error);
      throw new Error('Failed to decrypt credential with provided salt');
    }
  }

  /**
   * Rotate the encryption key by re-encrypting data with a new key
   * @param oldKey The current encryption key
   * @param newKey The new encryption key
   * @param encryptedData The data to re-encrypt
   * @returns Re-encrypted data with the new key
   */
  rotateKey(oldKey: string, newKey: string, encryptedData: string): string {
    // Temporarily create an instance with the old key
    const oldEncryption = new CredentialEncryption();
    oldEncryption.masterKey = crypto.pbkdf2Sync(
      oldKey, 
      this.getOrCreateSalt(), 
      this.iterations, 
      this.keyLength, 
      'sha256'
    );
    
    // Decrypt with old key
    const plaintext = oldEncryption.decrypt(encryptedData);
    
    // Re-encrypt with current (new) key
    return this.encrypt(plaintext);
  }

  /**
   * Generate a secure random password
   * @param length Password length (default: 32)
   * @returns Random password string
   */
  generateSecurePassword(length: number = 32): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const randomBytes = crypto.randomBytes(length);
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }
    
    return password;
  }

  /**
   * Hash a value for comparison (non-reversible)
   * Used for storing values that need to be compared but not decrypted
   * @param value The value to hash
   * @returns Hashed value
   */
  hash(value: string): string {
    return crypto
      .createHash('sha256')
      .update(value + this.masterKey.toString('hex'))
      .digest('hex');
  }

  /**
   * Compare a plaintext value with a hash
   * @param plaintext The plaintext value
   * @param hash The hash to compare against
   * @returns True if they match
   */
  compareHash(plaintext: string, hash: string): boolean {
    const computedHash = this.hash(plaintext);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash),
      Buffer.from(hash)
    );
  }
}

// Export singleton instance
let encryptionInstance: CredentialEncryption | null = null;

export function getCredentialEncryption(): CredentialEncryption {
  if (!encryptionInstance) {
    encryptionInstance = new CredentialEncryption();
  }
  return encryptionInstance;
}

// Export for testing only
export function resetEncryptionInstance(): void {
  encryptionInstance = null;
}

// Export types
export interface EncryptedCredential {
  username?: string;
  encryptedPassword?: string;
  tenantId?: string;
  clientId?: string;
  encryptedClientSecret?: string;
}