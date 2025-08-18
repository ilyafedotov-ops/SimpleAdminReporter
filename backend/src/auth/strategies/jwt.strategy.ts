import { Request, Response } from 'express';
import { BaseAuthStrategy } from './base.strategy';
import { AuthMode, LoginResponse } from '../types';

export class JWTStrategy extends BaseAuthStrategy {
  mode = AuthMode.JWT;

  extractToken(req: Request): string | null {
    // Extract token from Authorization header
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
        return '';
      }
      return authHeader.substring(7);
    }
    return null;
  }

  setAuthResponse(res: Response, loginResponse: LoginResponse): void {
    // For JWT strategy, tokens are returned in response body
    // No cookies are set
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
          isActive: loginResponse.user.isActive,
          lastLogin: loginResponse.user.lastLogin
        } : null,
        accessToken: loginResponse.accessToken,
        refreshToken: loginResponse.refreshToken,
        expiresIn: loginResponse.expiresIn,
        tokenType: 'Bearer'
      }
    });
  }

  clearAuth(_res: Response): void {
    // For JWT, no cookies to clear
    // Client is responsible for removing tokens from storage
  }
}