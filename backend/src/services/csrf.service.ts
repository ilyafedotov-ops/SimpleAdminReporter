import crypto from 'crypto';
import { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { getCookieOptions, COOKIE_NAMES, COOKIE_MAX_AGE } from '@/config/cookie.config';
import { redis } from '@/config/redis';

export interface CSRFToken {
  token: string;
  expiresAt: Date;
}

class CSRFService {
  private readonly tokenLength = 32;
  private readonly tokenPrefix = 'csrf_';
  
  /**
   * Generate a new CSRF token
   */
  generateToken(): string {
    const randomBytes = crypto.randomBytes(this.tokenLength);
    const token = randomBytes.toString('base64url');
    return `${this.tokenPrefix}${token}`;
  }
  
  /**
   * Set CSRF token cookie and return token
   */
  setCSRFToken(res: Response): string {
    const token = this.generateToken();
    
    // Set CSRF token in cookie (for double-submit pattern)
    res.cookie(
      COOKIE_NAMES.CSRF_TOKEN,
      token,
      getCookieOptions(COOKIE_MAX_AGE.CSRF_TOKEN)
    );
    
    return token;
  }

  /**
   * Generate and store a CSRF token for a session
   * This provides additional security by persisting tokens
   */
  async generateAndStoreToken(sessionId: string): Promise<string> {
    const token = this.generateToken();
    const key = `csrf:${sessionId}`;
    
    // Store token in Redis with expiry
    await redis.setJson(key, {
      token,
      createdAt: new Date().toISOString()
    }, COOKIE_MAX_AGE.CSRF_TOKEN / 1000);
    
    logger.debug(`CSRF token stored for session: ${sessionId}`);
    return token;
  }
  
  /**
   * Validate CSRF token using double-submit cookie pattern
   */
  validateCSRFToken(req: Request): boolean {
    // Skip validation for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return true;
    }
    
    // Get token from header
    const headerToken = req.get('X-CSRF-Token') || req.get('CSRF-Token');
    
    // Get token from cookie
    const cookieToken = req.cookies[COOKIE_NAMES.CSRF_TOKEN];
    
    // Both must exist and match
    if (!headerToken || !cookieToken) {
      logger.warn('CSRF token missing', {
        hasHeader: !!headerToken,
        hasCookie: !!cookieToken,
        path: req.path,
        method: req.method
      });
      return false;
    }
    
    // Validate token format
    if (!headerToken.startsWith(this.tokenPrefix) || !cookieToken.startsWith(this.tokenPrefix)) {
      logger.warn('Invalid CSRF token format');
      return false;
    }
    
    // Compare tokens (timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(headerToken),
      Buffer.from(cookieToken)
    );
    
    if (!isValid) {
      logger.warn('CSRF token mismatch', {
        path: req.path,
        method: req.method
      });
    }
    
    return isValid;
  }
  
  /**
   * Clear CSRF token cookie
   */
  clearCSRFToken(res: Response): void {
    res.clearCookie(COOKIE_NAMES.CSRF_TOKEN);
  }

  /**
   * Enhanced async validation with Redis persistence check
   */
  async validateCSRFTokenAsync(req: Request): Promise<boolean> {
    // First do the synchronous validation
    const basicValidation = this.validateCSRFToken(req);
    
    if (!basicValidation) {
      return false;
    }
    
    // Additional check: Verify token exists in Redis (if session available)
    // Check for session ID from unified auth (can be in user object or custom property)
    const sessionId = (req as any).sessionId || req.session?.id;
    
    if (sessionId) {
      const key = `csrf:${sessionId}`;
      const storedData = await redis.getJson(key) as { token?: string } | null;
      
      if (storedData && storedData.token) {
        const headerToken = req.get('X-CSRF-Token') || req.get('CSRF-Token');
        if (storedData.token !== headerToken) {
          logger.warn('CSRF validation failed: token not found in store', {
            path: req.path,
            method: req.method,
            sessionId: sessionId
          });
          return false;
        }
      }
    }
    
    return true;
  }
}

// Export singleton instance
export const csrfService = new CSRFService();
export default csrfService;