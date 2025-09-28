import { Server, Socket } from 'socket.io';
import { WebSocketMessage, Constants } from '@ai-dev/shared';

export function setupWebSocket(io: Server): void {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // TODO: Verify JWT token and get user
      // const user = await verifyToken(token);
      // socket.data.user = user;

      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.info(`Client connected: ${socket.id}`);

    // Join user's personal room
    const userId = socket.data.user?.id || 'anonymous';
    socket.join(`user:${userId}`);

    // Handle request subscription
    socket.on('subscribe:request', (requestId: string) => {
      socket.join(`request:${requestId}`);
      console.info(`Socket ${socket.id} subscribed to request ${requestId}`);
    });

    // Handle request unsubscription
    socket.on('unsubscribe:request', (requestId: string) => {
      socket.leave(`request:${requestId}`);
      console.info(`Socket ${socket.id} unsubscribed from request ${requestId}`);
    });

    // Handle heartbeat
    socket.on('heartbeat', () => {
      const message: WebSocketMessage = {
        type: 'heartbeat',
        data: { timestamp: Date.now() },
        timestamp: new Date().toISOString(),
      };
      socket.emit('heartbeat', message);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Send initial connection success message
    const welcomeMessage: WebSocketMessage = {
      type: 'status',
      data: { status: 'connected', socketId: socket.id },
      timestamp: new Date().toISOString(),
    };
    socket.emit('connected', welcomeMessage);
  });

  // Set up heartbeat interval
  setInterval(() => {
    const heartbeatMessage: WebSocketMessage = {
      type: 'heartbeat',
      data: { timestamp: Date.now() },
      timestamp: new Date().toISOString(),
    };
    io.emit('server:heartbeat', heartbeatMessage);
  }, Constants.WS_HEARTBEAT_INTERVAL);
}

export function emitToUser(io: Server, userId: string, message: WebSocketMessage): void {
  io.to(`user:${userId}`).emit('message', message);
}

export function emitToRequest(io: Server, requestId: string, message: WebSocketMessage): void {
  io.to(`request:${requestId}`).emit('request:update', message);
}