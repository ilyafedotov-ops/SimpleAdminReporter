import { Request, Response } from 'express';
import { BaseAuthStrategy } from './base.strategy';
import { AuthMode, LoginResponse } from '../types';
import { getCookieOptions, getRefreshTokenCookieOptions, COOKIE_NAMES, COOKIE_MAX_AGE } from '@/config/cookie.config';

export class CookieStrategy extends BaseAuthStrategy {
  mode = AuthMode.COOKIE;

  extractToken(req: Request): string | null {
    // Try to get token from cookie first
    // Handle case where req.cookies might be undefined or null
    if (req.cookies && typeof req.cookies === 'object') {
      // Check if the cookie property exists (even if undefined)
      if (COOKIE_NAMES.ACCESS_TOKEN in req.cookies) {
        const cookieToken = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
        return cookieToken;
      }
    }

    // Fall back to Authorization header for backward compatibility
    const authHeader = req.headers.authorization;
    
    // Handle case where authHeader is an array (invalid but possible)
    if (Array.isArray(authHeader)) {
      return null;
    }
    
    // Handle case where authHeader is not a string
    if (typeof authHeader !== 'string') {
      return null;
    }
    
    if (authHeader.startsWith('Bearer ')) {
      // Handle case where there's nothing after "Bearer "
      if (authHeader.length === 7) {
        return null;
      }
      return authHeader.substring(7);
    }

    return null;
  }

  setAuthResponse(res: Response, loginResponse: LoginResponse): void {
    // Set access token cookie
    if (loginResponse.accessToken) {
      res.cookie(
        COOKIE_NAMES.ACCESS_TOKEN,
        loginResponse.accessToken,
        getCookieOptions(COOKIE_MAX_AGE.ACCESS_TOKEN)
      );
    }

    // Set refresh token cookie with restricted path
    if (loginResponse.refreshToken) {
      res.cookie(
        COOKIE_NAMES.REFRESH_TOKEN,
        loginResponse.refreshToken,
        getRefreshTokenCookieOptions()
      );
    }

    // Set CSRF token cookie
    if (loginResponse.csrfToken) {
      res.cookie(
        COOKIE_NAMES.CSRF_TOKEN,
        loginResponse.csrfToken,
        getCookieOptions(COOKIE_MAX_AGE.CSRF_TOKEN)
      );
    }

    // Return response without tokens in body for security
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: loginResponse.user ? {
          id: loginResponse.user.id,
          username: loginResponse.user.username,
          displayName: loginResponse.user.displayName,
          email: loginResponse.user.email,
          authSource: loginResponse.user.authSource,
          department: loginResponse.user.department,
          title: loginResponse.user.title,
          isAdmin: loginResponse.user.isAdmin,
          lastLogin: loginResponse.user.lastLogin
        } : null,
        csrfToken: loginResponse.csrfToken,
        expiresIn: loginResponse.expiresIn
      }
    });
  }

  clearAuth(res: Response): void {
    // Clear all auth-related cookies
    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN);
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: '/api/auth/refresh' });
    res.clearCookie(COOKIE_NAMES.CSRF_TOKEN);
    res.clearCookie(COOKIE_NAMES.SESSION_ID);
  }
}