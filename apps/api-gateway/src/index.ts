import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDatabase, connectRedis } from '@ai-dev/database';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { setupRoutes } from './routes';
import { setupWebSocket } from './websocket';
import { setupQueues } from './queues';
import { initializeServices, shutdownServices } from './services';

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  try {
    // Initialize database connections
    await connectDatabase();
    await connectRedis();

    // Initialize services
    await initializeServices();

    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
      cors: {
        origin: process.env.WEB_APP_URL || 'http://localhost:3001',
        credentials: true,
      },
    });

    // Middleware
    app.use(helmet());
    app.use(compression());
    app.use(
      cors({
        origin: process.env.WEB_APP_URL || 'http://localhost:3001',
        credentials: true,
      }),
    );
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (NODE_ENV === 'development') {
      app.use(morgan('dev'));
    } else {
      app.use(morgan('combined'));
    }

    // Health check
    app.get('/health', async (req, res) => {
      try {
        const { getServicesStatus } = await import('./services');
        const servicesStatus = await getServicesStatus();

        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: NODE_ENV,
          services: servicesStatus,
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: NODE_ENV,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // API Routes
    setupRoutes(app);

    // WebSocket setup
    setupWebSocket(io);

    // Queue setup
    await setupQueues();

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Start server
    server.listen(PORT, () => {
      console.info(`
🚀 AI Dev Assistant API Gateway
📍 Running at: http://localhost:${PORT}
🌍 Environment: ${NODE_ENV}
📊 Health: http://localhost:${PORT}/health
📡 WebSocket: ws://localhost:${PORT}
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        await disconnectServices();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.info('SIGINT signal received: closing HTTP server');
      server.close(async () => {
        await disconnectServices();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function disconnectServices() {
  try {
    // Shutdown our services first
    await shutdownServices();

    // Then disconnect database connections
    const { disconnectDatabase, disconnectRedis } = await import('@ai-dev/database');
    await disconnectDatabase();
    await disconnectRedis();
    console.info('All services disconnected');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
}

startServer();