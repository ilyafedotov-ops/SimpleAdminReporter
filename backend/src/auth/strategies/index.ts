import { AuthStrategy, AuthMode } from '../types';
import { JWTStrategy } from './jwt.strategy';
import { CookieStrategy } from './cookie.strategy';

export class AuthStrategyFactory {
  private static jwtStrategy = new JWTStrategy();
  private static cookieStrategy = new CookieStrategy();

  static getStrategy(mode: AuthMode): AuthStrategy {
    switch (mode) {
      case AuthMode.JWT:
        return this.jwtStrategy;
      case AuthMode.COOKIE:
        return this.cookieStrategy;
      default:
        throw new Error(`Unknown auth mode: ${mode}`);
    }
  }

  static getDefaultStrategy(): AuthStrategy {
    // Always use JWT strategy
    return this.jwtStrategy;
  }
}

export { BaseAuthStrategy } from './base.strategy';
export { JWTStrategy } from './jwt.strategy';
export { CookieStrategy } from './cookie.strategy';