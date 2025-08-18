import { AuthStrategyFactory } from './index';
import { JWTStrategy } from './jwt.strategy';
import { CookieStrategy } from './cookie.strategy';
import { AuthMode } from '../types';

describe('AuthStrategyFactory - Comprehensive Tests', () => {
  describe('getStrategy method', () => {
    describe('Happy Path Scenarios', () => {
      test('should return JWT strategy for JWT mode', () => {
        // Act
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);

        // Assert
        expect(strategy).toBeInstanceOf(JWTStrategy);
        expect(strategy.mode).toBe(AuthMode.JWT);
      });

      test('should return Cookie strategy for Cookie mode', () => {
        // Act
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);

        // Assert
        expect(strategy).toBeInstanceOf(CookieStrategy);
        expect(strategy.mode).toBe(AuthMode.COOKIE);
      });

      test('should return the same instance for multiple calls with same mode', () => {
        // Act
        const strategy1 = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const strategy2 = AuthStrategyFactory.getStrategy(AuthMode.JWT);

        // Assert
        expect(strategy1).toBe(strategy2); // Should be the same instance (singleton)
      });

      test('should return different instances for different modes', () => {
        // Act
        const jwtStrategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const cookieStrategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);

        // Assert
        expect(jwtStrategy).not.toBe(cookieStrategy);
        expect(jwtStrategy).toBeInstanceOf(JWTStrategy);
        expect(cookieStrategy).toBeInstanceOf(CookieStrategy);
      });
    });

    describe('Error Conditions', () => {
      test('should throw error for unknown auth mode', () => {
        // Arrange
        const unknownMode = 'UNKNOWN' as AuthMode;

        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy(unknownMode);
        }).toThrow('Unknown auth mode: UNKNOWN');
      });

      test('should throw error for null auth mode', () => {
        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy(null as any);
        }).toThrow('Unknown auth mode: null');
      });

      test('should throw error for undefined auth mode', () => {
        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy(undefined as any);
        }).toThrow('Unknown auth mode: undefined');
      });

      test('should throw error for empty string auth mode', () => {
        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy('' as AuthMode);
        }).toThrow('Unknown auth mode: ');
      });
    });

    describe('Security Edge Cases', () => {
      test('should handle auth mode injection attempts', () => {
        // Arrange
        const maliciousMode = 'JWT; DROP TABLE users; --' as AuthMode;

        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy(maliciousMode);
        }).toThrow('Unknown auth mode: JWT; DROP TABLE users; --');
      });

      test('should handle numeric auth mode values', () => {
        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy(123 as any);
        }).toThrow('Unknown auth mode: 123');
      });

      test('should handle object auth mode values', () => {
        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy({ mode: 'JWT' } as any);
        }).toThrow('Unknown auth mode: [object Object]');
      });

      test('should handle boolean auth mode values', () => {
        // Act & Assert
        expect(() => {
          AuthStrategyFactory.getStrategy(true as any);
        }).toThrow('Unknown auth mode: true');
      });
    });

    describe('Strategy Interface Compliance', () => {
      test('JWT strategy should implement all required methods', () => {
        // Act
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);

        // Assert
        expect(strategy).toHaveProperty('mode');
        expect(strategy).toHaveProperty('extractToken');
        expect(strategy).toHaveProperty('setAuthResponse');
        expect(strategy).toHaveProperty('clearAuth');
        expect(typeof strategy.extractToken).toBe('function');
        expect(typeof strategy.setAuthResponse).toBe('function');
        expect(typeof strategy.clearAuth).toBe('function');
      });

      test('Cookie strategy should implement all required methods', () => {
        // Act
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);

        // Assert
        expect(strategy).toHaveProperty('mode');
        expect(strategy).toHaveProperty('extractToken');
        expect(strategy).toHaveProperty('setAuthResponse');
        expect(strategy).toHaveProperty('clearAuth');
        expect(typeof strategy.extractToken).toBe('function');
        expect(typeof strategy.setAuthResponse).toBe('function');
        expect(typeof strategy.clearAuth).toBe('function');
      });
    });

    describe('Strategy Method Functionality', () => {
      test('JWT strategy methods should be callable', () => {
        // Arrange
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const mockRequest = { headers: {} } as any;
        const mockResponse = { json: jest.fn() } as any;
        const mockLoginResponse = {
          user: { id: 1, username: 'test', displayName: 'Test User', email: 'test@example.com', authSource: 'ad' as const, isAdmin: false, isActive: true },
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresIn: 3600
        };

        // Act & Assert - Should not throw
        expect(() => {
          strategy.extractToken(mockRequest);
          strategy.setAuthResponse(mockResponse, mockLoginResponse);
          strategy.clearAuth(mockResponse);
        }).not.toThrow();
      });

      test('Cookie strategy methods should be callable', () => {
        // Arrange
        const strategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
        const mockRequest = { headers: {}, cookies: {} } as any;
        const mockResponse = { json: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() } as any;
        const mockLoginResponse = {
          user: { id: 1, username: 'test', displayName: 'Test User', email: 'test@example.com', authSource: 'ad' as const, isAdmin: false, isActive: true },
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresIn: 3600
        };

        // Act & Assert - Should not throw
        expect(() => {
          strategy.extractToken(mockRequest);
          strategy.setAuthResponse(mockResponse, mockLoginResponse);
          strategy.clearAuth(mockResponse);
        }).not.toThrow();
      });
    });
  });

  describe('getDefaultStrategy method', () => {
    describe('Happy Path Scenarios', () => {
      test('should return JWT strategy as default', () => {
        // Act
        const strategy = AuthStrategyFactory.getDefaultStrategy();

        // Assert
        expect(strategy).toBeInstanceOf(JWTStrategy);
        expect(strategy.mode).toBe(AuthMode.JWT);
      });

      test('should return the same instance as getStrategy for JWT mode', () => {
        // Act
        const defaultStrategy = AuthStrategyFactory.getDefaultStrategy();
        const jwtStrategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);

        // Assert
        expect(defaultStrategy).toBe(jwtStrategy);
      });

      test('should always return the same instance when called multiple times', () => {
        // Act
        const strategy1 = AuthStrategyFactory.getDefaultStrategy();
        const strategy2 = AuthStrategyFactory.getDefaultStrategy();

        // Assert
        expect(strategy1).toBe(strategy2);
      });
    });

    describe('Strategy Consistency', () => {
      test('default strategy should have correct mode', () => {
        // Act
        const strategy = AuthStrategyFactory.getDefaultStrategy();

        // Assert
        expect(strategy.mode).toBe(AuthMode.JWT);
      });

      test('default strategy should implement all required methods', () => {
        // Act
        const strategy = AuthStrategyFactory.getDefaultStrategy();

        // Assert
        expect(strategy).toHaveProperty('extractToken');
        expect(strategy).toHaveProperty('setAuthResponse');
        expect(strategy).toHaveProperty('clearAuth');
        expect(typeof strategy.extractToken).toBe('function');
        expect(typeof strategy.setAuthResponse).toBe('function');
        expect(typeof strategy.clearAuth).toBe('function');
      });
    });
  });

  describe('Factory Pattern Implementation', () => {
    describe('Singleton Pattern', () => {
      test('should maintain singleton instances across method calls', () => {
        // Act
        const jwt1 = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const jwt2 = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const cookie1 = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
        const cookie2 = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
        const default1 = AuthStrategyFactory.getDefaultStrategy();
        const default2 = AuthStrategyFactory.getDefaultStrategy();

        // Assert
        expect(jwt1).toBe(jwt2);
        expect(cookie1).toBe(cookie2);
        expect(default1).toBe(default2);
        expect(jwt1).toBe(default1);
        expect(jwt1).not.toBe(cookie1);
      });

      test('should not create new instances unnecessarily', () => {
        // Arrange
        const originalJWTStrategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const originalCookieStrategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);

        // Act - Multiple calls
        for (let i = 0; i < 10; i++) {
          const jwt = AuthStrategyFactory.getStrategy(AuthMode.JWT);
          const cookie = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);

          // Assert - Same instances
          expect(jwt).toBe(originalJWTStrategy);
          expect(cookie).toBe(originalCookieStrategy);
        }
      });
    });

    describe('Factory Method Robustness', () => {
      test('should handle rapid successive calls', () => {
        // Act & Assert - Should not throw or cause race conditions
        expect(() => {
          for (let i = 0; i < 100; i++) {
            AuthStrategyFactory.getStrategy(AuthMode.JWT);
            AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
            AuthStrategyFactory.getDefaultStrategy();
          }
        }).not.toThrow();
      });

      test('should handle mixed mode requests', () => {
        // Arrange
        const modes = [AuthMode.JWT, AuthMode.COOKIE];
        const strategies: any[] = [];

        // Act
        for (let i = 0; i < 50; i++) {
          const mode = modes[i % modes.length];
          strategies.push(AuthStrategyFactory.getStrategy(mode));
        }

        // Assert - Should have alternating but consistent instances
        for (let i = 0; i < strategies.length; i += 2) {
          if (i + 1 < strategies.length) {
            expect(strategies[i]).toBeInstanceOf(JWTStrategy);
            expect(strategies[i + 1]).toBeInstanceOf(CookieStrategy);
          }
        }
      });
    });

    describe('Memory Management', () => {
      test('should not leak memory with repeated calls', () => {
        // Arrange
        const initialJWT = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const initialCookie = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);

        // Act - Many calls
        for (let i = 0; i < 1000; i++) {
          AuthStrategyFactory.getStrategy(AuthMode.JWT);
          AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
          AuthStrategyFactory.getDefaultStrategy();
        }

        // Assert - Same instances (no leaks)
        const finalJWT = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const finalCookie = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);

        expect(finalJWT).toBe(initialJWT);
        expect(finalCookie).toBe(initialCookie);
      });
    });
  });

  describe('Error Recovery', () => {
    test('should continue working after error conditions', () => {
      // Act & Assert - Error condition
      expect(() => {
        AuthStrategyFactory.getStrategy('INVALID' as AuthMode);
      }).toThrow();

      // Assert - Should still work normally after error
      expect(() => {
        const jwt = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const cookie = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
        expect(jwt).toBeInstanceOf(JWTStrategy);
        expect(cookie).toBeInstanceOf(CookieStrategy);
      }).not.toThrow();
    });

    test('should handle multiple error conditions gracefully', () => {
      // Arrange
      const invalidModes = [null, undefined, '', 'INVALID', 123, {}, true];

      // Act & Assert - All should throw errors
      invalidModes.forEach(mode => {
        expect(() => {
          AuthStrategyFactory.getStrategy(mode as any);
        }).toThrow();
      });

      // Assert - Should still work normally after multiple errors
      expect(() => {
        const jwt = AuthStrategyFactory.getStrategy(AuthMode.JWT);
        const cookie = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
        const defaultStrategy = AuthStrategyFactory.getDefaultStrategy();
        
        expect(jwt).toBeInstanceOf(JWTStrategy);
        expect(cookie).toBeInstanceOf(CookieStrategy);
        expect(defaultStrategy).toBeInstanceOf(JWTStrategy);
      }).not.toThrow();
    });
  });

  describe('Type Safety', () => {
    test('should ensure returned strategies match their declared types', () => {
      // Act
      const jwtStrategy = AuthStrategyFactory.getStrategy(AuthMode.JWT);
      const cookieStrategy = AuthStrategyFactory.getStrategy(AuthMode.COOKIE);
      const defaultStrategy = AuthStrategyFactory.getDefaultStrategy();

      // Assert - Type checks
      expect(jwtStrategy.mode).toBe(AuthMode.JWT);
      expect(cookieStrategy.mode).toBe(AuthMode.COOKIE);
      expect(defaultStrategy.mode).toBe(AuthMode.JWT);

      // Assert - Instance checks
      expect(jwtStrategy.constructor.name).toBe('JWTStrategy');
      expect(cookieStrategy.constructor.name).toBe('CookieStrategy');
      expect(defaultStrategy.constructor.name).toBe('JWTStrategy');
    });

    test('should maintain type consistency across calls', () => {
      // Act - Multiple calls
      const strategies = Array.from({ length: 10 }, () => ({
        jwt: AuthStrategyFactory.getStrategy(AuthMode.JWT),
        cookie: AuthStrategyFactory.getStrategy(AuthMode.COOKIE),
        default: AuthStrategyFactory.getDefaultStrategy()
      }));

      // Assert - All should have consistent types
      strategies.forEach(({ jwt, cookie, default: def }) => {
        expect(jwt.mode).toBe(AuthMode.JWT);
        expect(cookie.mode).toBe(AuthMode.COOKIE);
        expect(def.mode).toBe(AuthMode.JWT);
        expect(jwt).toBeInstanceOf(JWTStrategy);
        expect(cookie).toBeInstanceOf(CookieStrategy);
        expect(def).toBeInstanceOf(JWTStrategy);
      });
    });
  });
});