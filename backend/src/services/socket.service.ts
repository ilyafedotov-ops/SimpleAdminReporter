import { Server as SocketIOServer, Socket } from "socket.io";
import { Server } from "http";
import { logger } from "@/utils/logger";
import { unifiedAuthService } from "@/auth/services/unified-auth.service";
import { logEventEmitter } from "@/events/log-events";
import { AuthenticatedSocket } from "@/types/socket.types";
import { COOKIE_NAMES } from "@/config/cookie.config";

export class SocketService {
  private io: SocketIOServer | null = null;
  private activeSockets = new Map<string, AuthenticatedSocket>();

  private extractHandshakeToken(socket: Socket): string | null {
    const authToken = socket.handshake.auth.token;
    if (typeof authToken === "string" && authToken) {
      return authToken;
    }

    const authorization = socket.handshake.headers.authorization;
    if (
      typeof authorization === "string" &&
      authorization.startsWith("Bearer ")
    ) {
      return authorization.replace("Bearer ", "");
    }

    const cookieHeader = socket.handshake.headers.cookie;
    if (typeof cookieHeader !== "string") {
      return null;
    }

    const cookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAMES.ACCESS_TOKEN}=`));

    return cookie
      ? decodeURIComponent(cookie.slice(COOKIE_NAMES.ACCESS_TOKEN.length + 1))
      : null;
  }

  /**
   * Initialize Socket.IO server
   */
  initialize(httpServer: Server): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        credentials: true,
      },
      transports: ["websocket", "polling"],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = this.extractHandshakeToken(socket);

        if (!token) {
          return next(new Error("Authentication token required"));
        }

        const user = await unifiedAuthService.verifyAccessToken(token);

        if (!user) {
          return next(new Error("Invalid authentication token"));
        }

        // Attach user to socket
        (socket as AuthenticatedSocket).user = user;
        (socket as AuthenticatedSocket).userId = user.id;

        next();
      } catch (error) {
        logger.error("Socket authentication error:", error);
        next(new Error("Authentication failed"));
      }
    });

    // Setup namespaces
    this.setupLogsNamespace();

    logger.info("Socket.IO server initialized");
  }

  /**
   * Setup logs namespace with rooms for different log types
   */
  private setupLogsNamespace(): void {
    if (!this.io) return;

    const logsNamespace = this.io.of("/socket/logs");

    logsNamespace.on("connection", (socket: Socket) => {
      const authSocket = socket as AuthenticatedSocket;
      const userId = authSocket.userId;

      logger.info(`User ${userId} connected to logs namespace`, {
        socketId: socket.id,
        userId,
      });

      // Add to active sockets
      this.activeSockets.set(socket.id, authSocket);

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Handle subscription to specific log types
      socket.on("subscribe", (logTypes: string[]) => {
        const validTypes = ["audit", "system", "combined"];
        const typesToSubscribe = logTypes.filter((type) =>
          validTypes.includes(type),
        );

        typesToSubscribe.forEach((type) => {
          socket.join(`logs:${type}`);
          logger.info(`User ${userId} subscribed to ${type} logs`);
        });

        socket.emit("subscribed", { types: typesToSubscribe });
      });

      // Handle unsubscription
      socket.on("unsubscribe", (logTypes: string[]) => {
        logTypes.forEach((type) => {
          socket.leave(`logs:${type}`);
          logger.info(`User ${userId} unsubscribed from ${type} logs`);
        });

        socket.emit("unsubscribed", { types: logTypes });
      });

      // Handle custom filters
      socket.on("setFilters", (filters: any) => {
        authSocket.filters = filters;
        socket.emit("filtersSet", { filters });
      });

      // Handle disconnect
      socket.on("disconnect", (reason) => {
        logger.info(`User ${userId} disconnected from logs namespace`, {
          socketId: socket.id,
          reason,
        });
        this.activeSockets.delete(socket.id);
      });

      // Send initial connection confirmation
      socket.emit("connected", {
        timestamp: new Date(),
        userId,
        socketId: socket.id,
      });
    });

    // Listen for new logs from event emitter
    this.setupLogEventListeners(logsNamespace);
  }

  /**
   * Setup listeners for log events
   */
  private setupLogEventListeners(logsNamespace: any): void {
    // Handle new audit logs
    logEventEmitter.on("audit_log", (log: any) => {
      // Emit to audit log subscribers
      logsNamespace.to("logs:audit").emit("newLog", {
        type: "audit",
        log,
      });

      // Also emit to combined subscribers
      logsNamespace.to("logs:combined").emit("newLog", {
        type: "audit",
        log,
      });

      // Check for user-specific filters
      this.activeSockets.forEach((socket) => {
        if (socket.filters && this.matchesFilters(log, socket.filters)) {
          socket.emit("filteredLog", {
            type: "audit",
            log,
          });
        }
      });
    });

    // Handle new system logs
    logEventEmitter.on("system_log", (log: any) => {
      // Emit to system log subscribers
      logsNamespace.to("logs:system").emit("newLog", {
        type: "system",
        log,
      });

      // Also emit to combined subscribers
      logsNamespace.to("logs:combined").emit("newLog", {
        type: "system",
        log,
      });

      // Check for user-specific filters
      this.activeSockets.forEach((socket) => {
        if (socket.filters && this.matchesFilters(log, socket.filters)) {
          socket.emit("filteredLog", {
            type: "system",
            log,
          });
        }
      });
    });

    // Generic log event (backwards compatibility)
    logEventEmitter.on("newLog", (log: any) => {
      const logType = log.log_type || "combined";
      logsNamespace.to(`logs:${logType}`).emit("newLog", {
        type: logType,
        log,
      });
    });
  }

  /**
   * Check if a log matches user-defined filters
   */
  private matchesFilters(log: any, filters: any): boolean {
    if (!filters) return true;

    // Check event type filter
    if (filters.eventType && log.event_type !== filters.eventType) {
      return false;
    }

    // Check level filter
    if (filters.level && log.level !== filters.level) {
      return false;
    }

    // Check search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const searchableFields = [
        log.message,
        log.username,
        log.event_action,
        log.module,
        log.service,
      ].filter(Boolean);

      const matches = searchableFields.some((field) =>
        field.toLowerCase().includes(searchLower),
      );

      if (!matches) return false;
    }

    // Check date range filter
    if (filters.startDate || filters.endDate) {
      const logDate = new Date(log.timestamp || log.created_at);

      if (filters.startDate && logDate < new Date(filters.startDate)) {
        return false;
      }

      if (filters.endDate && logDate > new Date(filters.endDate)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Emit a log to specific users
   */
  emitToUsers(userIds: number[], event: string, data: any): void {
    if (!this.io) return;

    const logsNamespace = this.io.of("/socket/logs");

    userIds.forEach((userId) => {
      logsNamespace.to(`user:${userId}`).emit(event, data);
    });
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any): void {
    if (!this.io) return;

    const logsNamespace = this.io.of("/socket/logs");
    logsNamespace.emit(event, data);
  }

  /**
   * Get statistics about connected clients
   */
  getStats(): any {
    if (!this.io) return null;

    const logsNamespace = this.io.of("/socket/logs");

    return {
      totalConnections: this.activeSockets.size,
      namespaces: {
        logs: {
          sockets: logsNamespace.sockets.size,
          rooms: {
            audit: logsNamespace.adapter.rooms.get("logs:audit")?.size || 0,
            system: logsNamespace.adapter.rooms.get("logs:system")?.size || 0,
            combined:
              logsNamespace.adapter.rooms.get("logs:combined")?.size || 0,
          },
        },
      },
    };
  }

  /**
   * Gracefully shutdown Socket.IO server
   */
  shutdown(): void {
    if (!this.io) return;

    // Notify all clients
    this.broadcast("serverShutdown", {
      message: "Server is shutting down",
      timestamp: new Date(),
    });

    // Close all connections
    this.io.close();
    this.activeSockets.clear();

    logger.info("Socket.IO server shut down");
  }
}

export const socketService = new SocketService();
