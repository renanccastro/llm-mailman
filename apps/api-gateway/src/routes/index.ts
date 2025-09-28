import { Express, Router } from 'express';
import { authRouter } from './auth';
import { userRouter } from './user';
import { requestRouter } from './request';
import { repositoryRouter } from './repository';
import { containerRouter } from './container';
import { containerSessionRouter } from './container-sessions';
import { webhookRouter } from './webhook';
import { emailWebhookRouter } from './email-webhook';
import { notificationRouter } from './notifications';
import { Constants } from '@ai-dev/shared';

export function setupRoutes(app: Express): void {
  const apiRouter = Router();

  // API versioning
  const v1Router = Router();

  // Mount routers
  v1Router.use('/auth', authRouter);
  v1Router.use('/users', userRouter);
  v1Router.use('/requests', requestRouter);
  v1Router.use('/repositories', repositoryRouter);
  v1Router.use('/containers', containerSessionRouter); // Use the new session router
  v1Router.use('/webhooks', webhookRouter);
  v1Router.use('/email', emailWebhookRouter);
  v1Router.use('/notifications', notificationRouter);

  // Mount versioned API
  apiRouter.use('/v1', v1Router);

  // Mount API router
  app.use('/api', apiRouter);

  // API documentation endpoint
  app.get('/api', (req, res) => {
    res.json({
      name: 'AI Dev Assistant API',
      version: Constants.API_VERSION,
      endpoints: {
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        requests: '/api/v1/requests',
        repositories: '/api/v1/repositories',
        containers: '/api/v1/containers',
        webhooks: '/api/v1/webhooks',
      },
      documentation: 'https://docs.aidev.platform',
    });
  });
}