import { Request, Response } from 'express';
import { AuthStrategy, AuthMode, LoginResponse } from '../types';

export abstract class BaseAuthStrategy implements AuthStrategy {
  abstract mode: AuthMode;
  
  abstract extractToken(req: Request): string | null;
  abstract setAuthResponse(res: Response, loginResponse: LoginResponse): void;
  abstract clearAuth(res: Response): void;
}