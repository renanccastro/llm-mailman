import Bull from 'bull';
import { redisQueue, prisma } from '@ai-dev/database';
import { aiOrchestrator, communicationService, containerManager, containerLifecycleManager } from '../services';

export interface EmailJob {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export interface ExecutionJob {
  requestId: string;
  userId: string;
  command: string;
  repositoryId?: string;
  repositoryName?: string;
  repositoryUrl?: string;
  branch?: string;
  containerId?: string;
}

export interface NotificationJob {
  userId: string;
  type: 'confirmation' | 'completion' | 'error';
  channel: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  data: Record<string, any>;
}

// Create queues
export const emailQueue = new Bull<EmailJob>('email', {
  redis: redisQueue.options,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const executionQueue = new Bull<ExecutionJob>('execution', {
  redis: redisQueue.options,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 10,
    attempts: 1,
    timeout: 300000, // 5 minutes
  },
});

export const notificationQueue = new Bull<NotificationJob>('notification', {
  redis: redisQueue.options,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export async function setupQueues(): Promise<void> {
  // Email queue processor
  emailQueue.process(async (job) => {
    console.info(`Processing email job ${job.id}:`, job.data);

    try {
      const result = await communicationService.sendEmail({
        to: job.data.to,
        subject: job.data.subject,
        html: job.data.html,
        text: job.data.text,
        from: job.data.from,
      });

      return { sent: true, messageId: result.messageId };
    } catch (error) {
      console.error(`Failed to send email:`, error);
      throw error;
    }
  });

  // Standard execution queue processor
  executionQueue.process('execute-command', async (job) => {
    console.info(`Processing execution job ${job.id}:`, job.data);

    try {
      const { requestId, userId, command, repositoryId, containerId } = job.data;

      // Create AI request
      const aiRequest = {
        id: requestId,
        userId,
        command,
        context: {
          repositoryId,
          containerId,
          workingDirectory: `/workspace/users/${userId}`,
        },
      };

      // Execute using AI orchestrator
      const result = await aiOrchestrator.executeRequest(aiRequest);

      return {
        executed: true,
        success: result.success,
        output: result.output,
        error: result.error,
        sessionId: result.metadata?.sessionId,
      };
    } catch (error) {
      console.error(`Failed to execute command:`, error);
      throw error;
    }
  });

  // Repository-scoped execution queue processor
  executionQueue.process('execute-with-repository', async (job) => {
    console.info(`Processing repository execution job ${job.id}:`, job.data);

    try {
      const { requestId, userId, command, repositoryId, repositoryName, repositoryUrl, branch } = job.data;

      // Extract thread ID from request or generate one
      const requestData = await prisma.request.findUnique({
        where: { id: requestId },
        include: { user: true }
      });

      const threadId = requestData?.source ?
        `${requestData.source}-${repositoryName || 'default'}` :
        `thread-${userId}-${Date.now()}`;

      console.log(`🔄 Getting or creating container for thread ${threadId}...`);

      // Use lifecycle manager to get or create container
      const containerId = await containerLifecycleManager.getOrCreateContainer(
        userId,
        threadId,
        repositoryId,
        repositoryUrl,
        branch || 'main'
      );

      console.log(`✅ Container ${containerId} ready for thread ${threadId}`);

      // Update activity to reset the 45-minute timer
      await containerLifecycleManager.updateActivity(containerId);

      // The repository should already be cloned by the lifecycle manager
      // Just verify it exists and pull latest changes
      await containerManager.executeCommand(userId, [
        'bash', '-c', `
          if [ ! -d "/workspace/${repositoryName || repositoryId}" ]; then
            cd /workspace &&
            git clone -b ${branch || 'main'} ${repositoryUrl} ${repositoryName || repositoryId} &&
            cd ${repositoryName || repositoryId} &&
            git config user.email "ai@dev.platform" &&
            git config user.name "AI Dev Assistant"
          else
            cd /workspace/${repositoryName || repositoryId} &&
            git fetch origin &&
            git pull origin ${branch || 'main'}
          fi
        `
      ]);

      console.log(`📦 Cloned repository ${repositoryName} into container`);

      // Create Claude Code session in the repository directory
      const sessionId = await aiOrchestrator.createSession(
        userId,
        `/workspace/${repositoryName}`,
        {
          repositoryPath: `/workspace/${repositoryName}`,
          repositoryName,
          branch: branch || 'main',
          environment: {
            REPOSITORY_NAME: repositoryName,
            REPOSITORY_URL: repositoryUrl,
            REPOSITORY_BRANCH: branch || 'main',
          },
        }
      );

      console.log(`🤖 Created Claude Code session ${sessionId}`);

      // Execute the command in the repository context
      const result = await aiOrchestrator.executeInSession(sessionId, command);

      console.log(`✅ Command executed in repository context`);

      // Update activity again after command completes
      await containerLifecycleManager.updateActivity(containerId);

      // Update request status
      await prisma.request.update({
        where: { id: requestId },
        data: {
          status: result.success ? 'COMPLETED' : 'FAILED',
          output: result.output,
          error: result.error,
          completedAt: new Date(),
          sessionId,
        },
      });

      // Send completion notification
      const requestRecord = await prisma.request.findUnique({
        where: { id: requestId },
        include: { user: true, repository: true }
      });

      if (requestRecord) {
        await notificationQueue.add('completion', {
          userId,
          type: 'completion',
          channel: 'EMAIL',
          data: {
            to: requestRecord.source,
            requestId,
            command,
            success: result.success,
            output: result.output,
            error: result.error,
            repository: repositoryName,
            sessionId,
          },
        });
      }

      return {
        executed: true,
        success: result.success,
        output: result.output,
        error: result.error,
        sessionId,
        containerId,
        repository: repositoryName,
      };
    } catch (error) {
      console.error(`Failed to execute repository command:`, error);

      // Update request as failed
      await prisma.request.update({
        where: { id: job.data.requestId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        },
      }).catch(() => {});

      throw error;
    }
  });

  // Notification queue processor
  notificationQueue.process(async (job) => {
    console.info(`Processing notification job ${job.id}:`, job.data);

    try {
      const { userId, type, channel, data } = job.data;

      let result;
      if (channel === 'EMAIL' || channel === 'BOTH') {
        result = await communicationService.sendNotification({
          userId,
          type,
          channel: 'EMAIL',
          data,
        } as any);
      }

      if (channel === 'WHATSAPP' || channel === 'BOTH') {
        await communicationService.sendNotification({
          userId,
          type,
          channel: 'WHATSAPP',
          data,
        } as any);
      }

      return { notified: true, result };
    } catch (error) {
      console.error(`Failed to send notification:`, error);
      throw error;
    }
  });

  // Queue event handlers
  emailQueue.on('completed', (job, result) => {
    console.info(`Email job ${job.id} completed:`, result);
  });

  emailQueue.on('failed', (job, err) => {
    console.error(`Email job ${job?.id} failed:`, err);
  });

  executionQueue.on('completed', (job, result) => {
    console.info(`Execution job ${job.id} completed:`, result);
  });

  executionQueue.on('failed', (job, err) => {
    console.error(`Execution job ${job?.id} failed:`, err);
  });

  notificationQueue.on('completed', (job, result) => {
    console.info(`Notification job ${job.id} completed:`, result);
  });

  notificationQueue.on('failed', (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err);
  });

  console.info('✅ Queues initialized successfully');
}