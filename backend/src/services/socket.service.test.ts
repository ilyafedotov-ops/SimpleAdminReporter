import { Server as HTTPServer } from 'http';
import { SocketService } from './socket.service';
import { User } from '@/auth/types';
import { logEventEmitter } from '@/events/log-events';

// Mock dependencies
jest.mock('@/utils/logger');
jest.mock('@/auth/services/unified-auth.service');
jest.mock('@/events/log-events', () => ({
  logEventEmitter: {
    on: jest.fn(),
    emit: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
  }
}));

// Import mocked services
import { logger } from '@/utils/logger';
import { unifiedAuthService } from '@/auth/services/unified-auth.service';

// Create mock classes for Socket.IO

class MockSocket {
  public id: string;
  public handshake: any;
  public rooms: Set<string> = new Set();
  public eventHandlers: Map<string, Function> = new Map();
  public user?: User;
  public userId?: number;
  public filters?: any;

  constructor(id: string, handshake: any) {
    this.id = id;
    this.handshake = handshake;
  }

  on(event: string, handler: Function): MockSocket {
    this.eventHandlers.set(event, handler);
    return this;
  }

  emit(_event: string, _data?: any): boolean {
    // Mock emit to client
    return true;
  }

  join(room: string): void {
    this.rooms.add(room);
  }

  leave(room: string): void {
    this.rooms.delete(room);
  }

  // Simulate triggering an event
  trigger(event: string, ...args: any[]): void {
    const handler = this.eventHandlers.get(event);
    if (handler) {
      handler(...args);
    }
  }
}


// Mock Socket.IO module - will be defined after classes
jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation((httpServer: any, options: any) => {
    const server = new (class {
      public options = options;
      public middlewares: Array<(socket: any, next: any) => void> = [];
      public namespaces: Map<string, any> = new Map();
      public sockets: any;
      
      constructor() {
        this.sockets = {
          size: 0
        };
        this.namespaces.set('/', this.sockets);
      }

      use(middleware: (socket: any, next: any) => void) {
        this.middlewares.push(middleware);
      }

      of(namespace: string): any {
        if (!this.namespaces.has(namespace)) {
          const mockNamespace = {
            name: namespace,
            sockets: new Map(),
            adapter: { rooms: new Map() },
            eventHandlers: new Map(),
            to: jest.fn().mockReturnValue({ emit: jest.fn() }),
            emit: jest.fn(),
            on: function(event: string, handler: Function) {
              this.eventHandlers.set(event, handler);
            },
            simulateConnection: function(socketId: string, handshake: any) {
              const socket = {
                id: socketId,
                handshake,
                rooms: new Set(),
                eventHandlers: new Map(),
                user: undefined,
                userId: undefined,
                filters: undefined,
                on: function(event: string, handler: Function) {
                  this.eventHandlers.set(event, handler);
                  return this;
                },
                emit: jest.fn().mockReturnValue(true),
                join: function(room: string) { this.rooms.add(room); },
                leave: function(room: string) { this.rooms.delete(room); },
                trigger: function(event: string, ...args: any[]) {
                  const handler = this.eventHandlers.get(event);
                  if (handler) handler(...args);
                }
              };
              this.sockets.set(socketId, socket);
              const connectionHandler = this.eventHandlers.get('connection');
              if (connectionHandler) connectionHandler(socket);
              return socket;
            },
            simulateDisconnection: function(socketId: string, reason: string) {
              const socket = this.sockets.get(socketId);
              if (socket) {
                socket.trigger('disconnect', reason);
                this.sockets.delete(socketId);
              }
            }
          };
          this.namespaces.set(namespace, mockNamespace);
        }
        return this.namespaces.get(namespace);
      }

      emit() {}
      close() { this.namespaces.clear(); }
    })();
    return server;
  })
}));

describe('SocketService', () => {
  let socketService: SocketService;
  let mockHttpServer: HTTPServer;
  let mockLogsNamespace: any;

  // Helper function to create authenticated mock socket
  const createAuthenticatedMockSocket = (id: string, userId: number): MockSocket => {
    const mockUser: User = {
      id: userId,
      username: `testuser${userId}`,
      displayName: `Test User ${userId}`,
      email: `test${userId}@example.com`,
      authSource: 'local',
      isAdmin: false,
      isActive: true
    };

    const socket = new MockSocket(id, { auth: { token: 'valid-token' } });
    socket.user = mockUser;
    socket.userId = userId;
    return socket;
  };

  // Type helper for accessing private properties
  type SocketServicePrivate = {
    io: any | null;
    activeSockets: Map<string, any>;
    setupLogsNamespace(): void;
    matchesFilters(log: any, filters: any): boolean;
  };

  // Helper to get non-null io instance
  const getSocketIO = (service: SocketService): any => {
    const io = (service as unknown as SocketServicePrivate).io;
    if (!io) throw new Error('Socket.IO not initialized');
    return io;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a new instance for each test
    socketService = new SocketService();
    mockHttpServer = {} as HTTPServer;
    
    // Setup environment variables
    process.env.FRONTEND_URL = 'http://localhost:3000';

    // Mock logger
    (logger.info as jest.Mock).mockImplementation(() => {});
    (logger.error as jest.Mock).mockImplementation(() => {});

    // Mock unifiedAuthService
    const mockUser: User = {
      id: 1,
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      authSource: 'local',
      isAdmin: false,
      isActive: true
    };
    (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockUser);
  });

  afterEach(() => {
    // Clean up any active socket service
    try {
      socketService.shutdown();
    } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should initialize Socket.IO server with correct configuration', () => {
      socketService.initialize(mockHttpServer);

      // Access the private io property for testing
      const io = getSocketIO(socketService);
      expect(io).toBeDefined();
      expect(io.options).toEqual({
        cors: {
          origin: 'http://localhost:3000',
          credentials: true
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000
      });
    });

    it('should use default FRONTEND_URL when not set', () => {
      delete process.env.FRONTEND_URL;
      
      socketService.initialize(mockHttpServer);

      const io = getSocketIO(socketService);
      expect(io.options.cors.origin).toBe('http://localhost:3000');
    });

    it('should setup authentication middleware', async () => {
      socketService.initialize(mockHttpServer);

      const io = getSocketIO(socketService);
      expect(io.middlewares).toHaveLength(1);

      // Test middleware with valid token
      const mockSocket = {
        handshake: {
          auth: { token: 'valid-token' },
          headers: {}
        }
      };
      const mockNext = jest.fn();

      await io.middlewares[0](mockSocket, mockNext);

      expect(unifiedAuthService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockSocket).toHaveProperty('user');
      expect(mockSocket).toHaveProperty('userId', 1);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should setup authentication middleware with token from headers', async () => {
      socketService.initialize(mockHttpServer);

      const io = getSocketIO(socketService);
      const mockSocket = {
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' }
        }
      };
      const mockNext = jest.fn();

      await io.middlewares[0](mockSocket, mockNext);

      expect(unifiedAuthService.verifyAccessToken).toHaveBeenCalledWith('header-token');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject connection without token', async () => {
      socketService.initialize(mockHttpServer);

      const io = getSocketIO(socketService);
      const mockSocket = {
        handshake: {
          auth: {},
          headers: {}
        }
      };
      const mockNext = jest.fn();

      await io.middlewares[0](mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication token required'));
    });

    it('should reject connection with invalid token', async () => {
      (unifiedAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(null);
      
      socketService.initialize(mockHttpServer);

      const io = getSocketIO(socketService);
      const mockSocket = {
        handshake: {
          auth: { token: 'invalid-token' },
          headers: {}
        }
      };
      const mockNext = jest.fn();

      await io.middlewares[0](mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new Error('Invalid authentication token'));
    });

    it('should handle authentication errors', async () => {
      (unifiedAuthService.verifyAccessToken as jest.Mock).mockRejectedValue(new Error('Auth service error'));
      
      socketService.initialize(mockHttpServer);

      const io = getSocketIO(socketService);
      const mockSocket = {
        handshake: {
          auth: { token: 'token' },
          headers: {}
        }
      };
      const mockNext = jest.fn();

      await io.middlewares[0](mockSocket, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Socket authentication error:', expect.any(Error));
      expect(mockNext).toHaveBeenCalledWith(new Error('Authentication failed'));
    });

    it('should setup logs namespace', () => {
      socketService.initialize(mockHttpServer);

      const io = getSocketIO(socketService);
      expect(io.namespaces.has('/logs')).toBe(true);
      
      const logsNamespace = io.namespaces.get('/logs');
      expect(logsNamespace!.eventHandlers.has('connection')).toBe(true);
    });

    it('should log successful initialization', () => {
      socketService.initialize(mockHttpServer);

      expect(logger.info).toHaveBeenCalledWith('Socket.IO server initialized');
    });
  });

  describe('logs namespace connection handling', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
      const io = getSocketIO(socketService);
      mockLogsNamespace = io.of('/logs');
    });

    it('should handle socket connection to logs namespace', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      mockLogsNamespace.sockets.set('socket-1', socket);

      // Trigger connection handler
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      expect(logger.info).toHaveBeenCalledWith(
        'User 1 connected to logs namespace',
        { socketId: 'socket-1', userId: 1 }
      );

      // Check if socket was added to active sockets
      const activeSockets = (socketService as unknown as SocketServicePrivate).activeSockets;
      expect(activeSockets.has('socket-1')).toBe(true);

      // Check if socket joined user room
      expect(socket.rooms.has('user:1')).toBe(true);
    });

    it('should emit connection confirmation', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      const emitSpy = jest.spyOn(socket, 'emit');
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      expect(emitSpy).toHaveBeenCalledWith('connected', {
        timestamp: expect.any(Date),
        userId: 1,
        socketId: 'socket-1'
      });
    });

    it('should handle subscription to log types', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const emitSpy = jest.spyOn(socket, 'emit');
      const joinSpy = jest.spyOn(socket, 'join');

      // Simulate subscription
      socket.trigger('subscribe', ['audit', 'system', 'invalid']);

      expect(joinSpy).toHaveBeenCalledWith('logs:audit');
      expect(joinSpy).toHaveBeenCalledWith('logs:system');
      expect(joinSpy).not.toHaveBeenCalledWith('logs:invalid');
      
      expect(emitSpy).toHaveBeenCalledWith('subscribed', {
        types: ['audit', 'system']
      });

      expect(logger.info).toHaveBeenCalledWith('User 1 subscribed to audit logs');
      expect(logger.info).toHaveBeenCalledWith('User 1 subscribed to system logs');
    });

    it('should handle unsubscription from log types', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const emitSpy = jest.spyOn(socket, 'emit');
      const leaveSpy = jest.spyOn(socket, 'leave');

      // Simulate unsubscription
      socket.trigger('unsubscribe', ['audit', 'system']);

      expect(leaveSpy).toHaveBeenCalledWith('logs:audit');
      expect(leaveSpy).toHaveBeenCalledWith('logs:system');
      
      expect(emitSpy).toHaveBeenCalledWith('unsubscribed', {
        types: ['audit', 'system']
      });

      expect(logger.info).toHaveBeenCalledWith('User 1 unsubscribed from audit logs');
      expect(logger.info).toHaveBeenCalledWith('User 1 unsubscribed from system logs');
    });

    it('should handle setting custom filters', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const emitSpy = jest.spyOn(socket, 'emit');
      const filters = {
        eventType: 'login',
        level: 'info',
        search: 'test'
      };

      // Simulate setting filters
      socket.trigger('setFilters', filters);

      expect(socket.filters).toEqual(filters);
      expect(emitSpy).toHaveBeenCalledWith('filtersSet', { filters });
    });

    it('should handle socket disconnection', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      mockLogsNamespace.sockets.set('socket-1', socket);
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      // Verify socket was added
      const activeSockets = (socketService as unknown as SocketServicePrivate).activeSockets;
      expect(activeSockets.has('socket-1')).toBe(true);

      // Simulate disconnection
      mockLogsNamespace.simulateDisconnection('socket-1', 'client disconnect');

      expect(logger.info).toHaveBeenCalledWith(
        'User 1 disconnected from logs namespace',
        { socketId: 'socket-1', reason: 'client disconnect' }
      );

      // Verify socket was removed
      expect(activeSockets.has('socket-1')).toBe(false);
    });
  });

  describe('log event listeners', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
      const io = getSocketIO(socketService);
      mockLogsNamespace = io.of('/logs');
    });

    it('should handle audit log events', () => {
      const toSpy = jest.spyOn(mockLogsNamespace, 'to').mockReturnValue({
        emit: jest.fn()
      } as any);

      const logData = {
        id: 1,
        message: 'Test audit log',
        event_type: 'login',
        timestamp: new Date()
      };

      // Get the audit_log event handler that was registered
      const auditLogHandler = (logEventEmitter.on as jest.Mock).mock.calls
        .find(call => call[0] === 'audit_log')?.[1];
      
      expect(auditLogHandler).toBeDefined();
      
      // Call the handler directly
      auditLogHandler(logData);

      expect(toSpy).toHaveBeenCalledWith('logs:audit');
      expect(toSpy).toHaveBeenCalledWith('logs:combined');
    });

    it('should handle system log events', () => {
      const toSpy = jest.spyOn(mockLogsNamespace, 'to').mockReturnValue({
        emit: jest.fn()
      } as any);

      const logData = {
        id: 1,
        message: 'Test system log',
        level: 'info',
        timestamp: new Date()
      };

      // Get the system_log event handler that was registered
      const systemLogHandler = (logEventEmitter.on as jest.Mock).mock.calls
        .find(call => call[0] === 'system_log')?.[1];
      
      expect(systemLogHandler).toBeDefined();
      
      // Call the handler directly
      systemLogHandler(logData);

      expect(toSpy).toHaveBeenCalledWith('logs:system');
      expect(toSpy).toHaveBeenCalledWith('logs:combined');
    });

    it('should handle generic log events', () => {
      const toSpy = jest.spyOn(mockLogsNamespace, 'to').mockReturnValue({
        emit: jest.fn()
      } as any);

      const logData = {
        id: 1,
        message: 'Test generic log',
        log_type: 'custom',
        timestamp: new Date()
      };

      // Get the newLog event handler that was registered
      const newLogHandler = (logEventEmitter.on as jest.Mock).mock.calls
        .find(call => call[0] === 'newLog')?.[1];
      
      expect(newLogHandler).toBeDefined();
      
      // Call the handler directly
      newLogHandler(logData);

      expect(toSpy).toHaveBeenCalledWith('logs:custom');
    });

    it('should emit filtered logs to sockets with matching filters', () => {
      // Setup a socket with filters
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      socket.filters = {
        eventType: 'login',
        level: 'info'
      };

      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const socketEmitSpy = jest.spyOn(socket, 'emit');

      const logData = {
        id: 1,
        message: 'User login successful',
        event_type: 'login',
        level: 'info',
        timestamp: new Date()
      };

      // Get the audit_log event handler that was registered
      const auditLogHandler = (logEventEmitter.on as jest.Mock).mock.calls
        .find(call => call[0] === 'audit_log')?.[1];
      
      expect(auditLogHandler).toBeDefined();
      
      // Call the handler directly
      auditLogHandler(logData);

      expect(socketEmitSpy).toHaveBeenCalledWith('filteredLog', {
        type: 'audit',
        log: logData
      });
    });

    it('should not emit filtered logs to sockets with non-matching filters', () => {
      // Setup a socket with filters
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      socket.filters = {
        eventType: 'logout'  // Different event type
      };

      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const socketEmitSpy = jest.spyOn(socket, 'emit');

      const logData = {
        id: 1,
        message: 'User login successful',
        event_type: 'login',  // Different from filter
        timestamp: new Date()
      };

      // Simulate audit log event
      logEventEmitter.emit('audit_log', logData);

      expect(socketEmitSpy).not.toHaveBeenCalledWith('filteredLog', expect.anything());
    });
  });

  describe('matchesFilters', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
    });

    it('should return true when no filters are provided', () => {
      const log = { message: 'test' };
      const result = (socketService as any).matchesFilters(log, null);
      expect(result).toBe(true);
    });

    it('should match event type filter', () => {
      const log = { event_type: 'login' };
      const filters = { eventType: 'login' };
      
      const result = (socketService as any).matchesFilters(log, filters);
      expect(result).toBe(true);

      const nonMatchResult = (socketService as any).matchesFilters(log, { eventType: 'logout' });
      expect(nonMatchResult).toBe(false);
    });

    it('should match level filter', () => {
      const log = { level: 'error' };
      const filters = { level: 'error' };
      
      const result = (socketService as any).matchesFilters(log, filters);
      expect(result).toBe(true);

      const nonMatchResult = (socketService as any).matchesFilters(log, { level: 'info' });
      expect(nonMatchResult).toBe(false);
    });

    it('should match search filter in multiple fields', () => {
      const log = {
        message: 'User login successful',
        username: 'testuser',
        event_action: 'authenticate',
        module: 'auth',
        service: 'ldap'
      };

      expect((socketService as any).matchesFilters(log, { search: 'user' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'login' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'testuser' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'auth' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'ldap' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'notfound' })).toBe(false);
    });

    it('should be case insensitive for search', () => {
      const log = {
        message: 'User Login Successful',
        username: 'TestUser'
      };

      expect((socketService as any).matchesFilters(log, { search: 'user' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'USER' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'Login' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { search: 'testuser' })).toBe(true);
    });

    it('should match date range filters', () => {
      const log = {
        timestamp: '2025-01-15T10:00:00Z'
      };

      const filters = {
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z'
      };

      expect((socketService as any).matchesFilters(log, filters)).toBe(true);

      // Test with created_at field
      const logWithCreatedAt = {
        created_at: '2025-01-15T10:00:00Z'
      };
      expect((socketService as any).matchesFilters(logWithCreatedAt, filters)).toBe(true);

      // Test outside range
      const filtersOutside = {
        startDate: '2025-02-01T00:00:00Z',
        endDate: '2025-02-28T23:59:59Z'
      };
      expect((socketService as any).matchesFilters(log, filtersOutside)).toBe(false);
    });

    it('should match start date only', () => {
      const log = { timestamp: '2025-01-15T10:00:00Z' };
      
      expect((socketService as any).matchesFilters(log, { startDate: '2025-01-01T00:00:00Z' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { startDate: '2025-01-20T00:00:00Z' })).toBe(false);
    });

    it('should match end date only', () => {
      const log = { timestamp: '2025-01-15T10:00:00Z' };
      
      expect((socketService as any).matchesFilters(log, { endDate: '2025-01-31T23:59:59Z' })).toBe(true);
      expect((socketService as any).matchesFilters(log, { endDate: '2025-01-01T00:00:00Z' })).toBe(false);
    });

    it('should handle missing searchable fields gracefully', () => {
      const log = {
        id: 1,
        timestamp: '2025-01-15T10:00:00Z'
        // No message, username, etc.
      };

      expect((socketService as any).matchesFilters(log, { search: 'test' })).toBe(false);
    });

    it('should match all filters when multiple are provided', () => {
      const log = {
        event_type: 'login',
        level: 'info',
        message: 'User login successful',
        timestamp: '2025-01-15T10:00:00Z'
      };

      const filters = {
        eventType: 'login',
        level: 'info',
        search: 'user',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z'
      };

      expect((socketService as any).matchesFilters(log, filters)).toBe(true);

      // Should fail if any filter doesn't match
      const filtersWithWrongLevel = { ...filters, level: 'error' };
      expect((socketService as any).matchesFilters(log, filtersWithWrongLevel)).toBe(false);
    });
  });

  describe('emitToUsers', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
    });

    it('should emit to specific users', () => {
      const io = getSocketIO(socketService);
      const logsNamespace = io.of("/logs");
      const toSpy = jest.spyOn(logsNamespace, 'to').mockReturnValue({
        emit: jest.fn()
      } as any);

      socketService.emitToUsers([1, 2, 3], 'notification', { message: 'test' });

      expect(toSpy).toHaveBeenCalledWith('user:1');
      expect(toSpy).toHaveBeenCalledWith('user:2');
      expect(toSpy).toHaveBeenCalledWith('user:3');
    });

    it('should handle empty user list', () => {
      const io = getSocketIO(socketService);
      const logsNamespace = io.of("/logs");
      const toSpy = jest.spyOn(logsNamespace, 'to');

      socketService.emitToUsers([], 'notification', { message: 'test' });

      expect(toSpy).not.toHaveBeenCalled();
    });

    it('should do nothing if Socket.IO is not initialized', () => {
      const uninitializedService = new SocketService();
      
      // Should not throw error
      expect(() => {
        uninitializedService.emitToUsers([1], 'test', {});
      }).not.toThrow();
    });
  });

  describe('broadcast', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
    });

    it('should broadcast to all connected clients', () => {
      const io = getSocketIO(socketService);
      const logsNamespace = io.of("/logs");
      const emitSpy = jest.spyOn(logsNamespace, 'emit');

      socketService.broadcast('announcement', { message: 'Server maintenance' });

      expect(emitSpy).toHaveBeenCalledWith('announcement', { message: 'Server maintenance' });
    });

    it('should do nothing if Socket.IO is not initialized', () => {
      const uninitializedService = new SocketService();
      
      // Should not throw error
      expect(() => {
        uninitializedService.broadcast('test', {});
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
    });

    it('should return connection statistics', () => {
      const io = getSocketIO(socketService);
      const logsNamespace = io.of("/logs");
      
      // Mock some rooms
      logsNamespace.adapter.rooms.set('logs:audit', new Set(['socket-1', 'socket-2']));
      logsNamespace.adapter.rooms.set('logs:system', new Set(['socket-1']));
      logsNamespace.adapter.rooms.set('logs:combined', new Set(['socket-1', 'socket-2', 'socket-3']));
      
      // Add some active sockets
      const activeSockets = (socketService as unknown as SocketServicePrivate).activeSockets;
      activeSockets.set('socket-1', createAuthenticatedMockSocket('socket-1', 1));
      activeSockets.set('socket-2', createAuthenticatedMockSocket('socket-2', 2));

      const stats = socketService.getStats();

      expect(stats).toEqual({
        totalConnections: 2,
        namespaces: {
          logs: {
            sockets: 0, // MockNamespace doesn't track sockets.size
            rooms: {
              audit: 2,
              system: 1,
              combined: 3
            }
          }
        }
      });
    });

    it('should handle missing rooms', () => {
      const stats = socketService.getStats();

      expect(stats).toEqual({
        totalConnections: 0,
        namespaces: {
          logs: {
            sockets: 0,
            rooms: {
              audit: 0,
              system: 0,
              combined: 0
            }
          }
        }
      });
    });

    it('should return null if Socket.IO is not initialized', () => {
      const uninitializedService = new SocketService();
      const stats = uninitializedService.getStats();
      expect(stats).toBeNull();
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
    });

    it('should gracefully shutdown Socket.IO server', () => {
      const io = getSocketIO(socketService);
      const _logsNamespace = io.of("/logs"); // eslint-disable-line @typescript-eslint/no-unused-vars
      const broadcastSpy = jest.spyOn(socketService, 'broadcast');
      const closeSpy = jest.spyOn(io, 'close');

      // Add some active sockets
      const activeSockets = (socketService as unknown as SocketServicePrivate).activeSockets;
      activeSockets.set('socket-1', createAuthenticatedMockSocket('socket-1', 1));
      activeSockets.set('socket-2', createAuthenticatedMockSocket('socket-2', 2));

      socketService.shutdown();

      expect(broadcastSpy).toHaveBeenCalledWith('serverShutdown', {
        message: 'Server is shutting down',
        timestamp: expect.any(Date)
      });

      expect(closeSpy).toHaveBeenCalled();
      expect(activeSockets.size).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Socket.IO server shut down');
    });

    it('should do nothing if Socket.IO is not initialized', () => {
      const uninitializedService = new SocketService();
      
      // Should not throw error
      expect(() => {
        uninitializedService.shutdown();
      }).not.toThrow();
    });
  });

  describe('concurrent connections', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
      const io = getSocketIO(socketService);
      mockLogsNamespace = io.of('/logs');
    });

    it('should handle multiple concurrent connections', () => {
      const sockets = [];
      
      // Simulate multiple connections
      for (let i = 1; i <= 5; i++) {
        const socket = createAuthenticatedMockSocket(`socket-${i}`, i);
        mockLogsNamespace.sockets.set(`socket-${i}`, socket);
        
        const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
        if (connectionHandler) {
          connectionHandler(socket);
        }
        
        sockets.push(socket);
      }

      const activeSockets = (socketService as unknown as SocketServicePrivate).activeSockets;
      expect(activeSockets.size).toBe(5);

      // Verify each socket is in their user room
      sockets.forEach((socket, index) => {
        expect(socket.rooms.has(`user:${index + 1}`)).toBe(true);
      });
    });

    it('should handle concurrent subscriptions and unsubscriptions', () => {
      const socket1 = createAuthenticatedMockSocket('socket-1', 1);
      const socket2 = createAuthenticatedMockSocket('socket-2', 2);

      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket1);
        connectionHandler(socket2);
      }

      // Concurrent subscriptions
      socket1.trigger('subscribe', ['audit', 'system']);
      socket2.trigger('subscribe', ['audit']);

      expect(socket1.rooms.has('logs:audit')).toBe(true);
      expect(socket1.rooms.has('logs:system')).toBe(true);
      expect(socket2.rooms.has('logs:audit')).toBe(true);
      expect(socket2.rooms.has('logs:system')).toBe(false);

      // Concurrent unsubscription
      socket1.trigger('unsubscribe', ['system']);
      
      expect(socket1.rooms.has('logs:system')).toBe(false);
      expect(socket1.rooms.has('logs:audit')).toBe(true);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle setupLogsNamespace when io is null', () => {
      const uninitializedService = new SocketService();
      
      // Call private method directly - should not throw
      expect(() => {
        (uninitializedService as unknown as SocketServicePrivate).setupLogsNamespace();
      }).not.toThrow();
    });

    it('should handle connection with undefined user properties', () => {
      socketService.initialize(mockHttpServer);
      const io = getSocketIO(socketService);
      mockLogsNamespace = io.of('/logs');

      const socket = new MockSocket('socket-1', {});
      // Don't set userId - should handle gracefully
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      
      expect(() => {
        if (connectionHandler) {
          connectionHandler(socket);
        }
      }).not.toThrow();
    });

    it('should handle log events with missing properties', () => {
      socketService.initialize(mockHttpServer);

      // Test with minimal log data
      const minimalLog = {
        id: 1
      };

      expect(() => {
        logEventEmitter.emit('audit_log', minimalLog);
        logEventEmitter.emit('system_log', minimalLog);
        logEventEmitter.emit('newLog', minimalLog);
      }).not.toThrow();
    });

    it('should handle filters with undefined properties', () => {
      socketService.initialize(mockHttpServer);

      const log = {
        message: 'test log'
      };

      const filtersWithUndefined = {
        eventType: undefined,
        level: undefined,
        search: undefined
      };

      // Should not throw and should match
      const result = (socketService as any).matchesFilters(log, filtersWithUndefined);
      expect(result).toBe(true);
    });

    it('should handle malformed date strings in filters', () => {
      socketService.initialize(mockHttpServer);

      const log = {
        timestamp: 'invalid-date'
      };

      const filters = {
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z'
      };

      // Should handle gracefully without throwing
      expect(() => {
        (socketService as unknown as SocketServicePrivate).matchesFilters(log, filters);
      }).not.toThrow();
    });
  });

  describe('message acknowledgments', () => {
    beforeEach(() => {
      socketService.initialize(mockHttpServer);
      const io = getSocketIO(socketService);
      mockLogsNamespace = io.of('/logs');
    });

    it('should handle subscription acknowledgments', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const emitSpy = jest.spyOn(socket, 'emit');

      // Test subscription acknowledgment
      socket.trigger('subscribe', ['audit']);
      
      expect(emitSpy).toHaveBeenCalledWith('subscribed', {
        types: ['audit']
      });
    });

    it('should handle unsubscription acknowledgments', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const emitSpy = jest.spyOn(socket, 'emit');

      // Test unsubscription acknowledgment
      socket.trigger('unsubscribe', ['audit']);
      
      expect(emitSpy).toHaveBeenCalledWith('unsubscribed', {
        types: ['audit']
      });
    });

    it('should handle filter setting acknowledgments', () => {
      const socket = createAuthenticatedMockSocket('socket-1', 1);
      
      const connectionHandler = mockLogsNamespace.eventHandlers.get('connection');
      if (connectionHandler) {
        connectionHandler(socket);
      }

      const emitSpy = jest.spyOn(socket, 'emit');
      const filters = { eventType: 'login' };

      // Test filter setting acknowledgment
      socket.trigger('setFilters', filters);
      
      expect(emitSpy).toHaveBeenCalledWith('filtersSet', {
        filters
      });
    });
  });
});