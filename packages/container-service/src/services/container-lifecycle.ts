import { EventEmitter } from 'events';
import { prisma, redis } from '@ai-dev/database';
import { ContainerManager } from './container-manager';
import { Logger } from '@ai-dev/shared';

interface ContainerSession {
  containerId: string;
  userId: string;
  threadId: string;
  repositoryId?: string;
  sessionId?: string; // Claude Code session ID
  lastActivityAt: Date;
  createdAt: Date;
  isActive: boolean;
}

export class ContainerLifecycleManager extends EventEmitter {
  private readonly logger = new Logger('ContainerLifecycle');
  private readonly IDLE_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes
  private readonly CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
  private readonly GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minute grace period
  private checkInterval?: NodeJS.Timeout;
  private containerSessions: Map<string, ContainerSession> = new Map();

  constructor(private containerManager: ContainerManager) {
    super();
  }

  async initialize(): Promise<void> {
    await this.loadActiveSessions();
    this.startIdleChecker();
    this.logger.info('Container lifecycle manager initialized');
  }

  async shutdown(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    await this.saveActiveSessions();
  }

  /**
   * Get or create a container for a thread
   */
  async getOrCreateContainer(
    userId: string,
    threadId: string,
    repositoryId?: string,
    repositoryUrl?: string,
    branch?: string
  ): Promise<string> {
    // Check if there's an active container for this thread
    const existingSession = await this.getThreadSession(threadId);

    if (existingSession && existingSession.isActive) {
      // Update last activity
      await this.updateActivity(existingSession.containerId);

      // Verify container is still running
      // TODO: Implement isContainerRunning method in ContainerManager
      const isRunning = true; // await this.containerManager.isContainerRunning(existingSession.containerId);

      if (isRunning) {
        this.logger.info(`Reusing existing container ${existingSession.containerId} for thread ${threadId}`);
        return existingSession.containerId;
      } else {
        // Container died, clean up session
        await this.cleanupSession(existingSession.containerId);
      }
    }

    // Create new container
    this.logger.info(`Creating new container for thread ${threadId}`);

    const containerId = await this.containerManager.createUserContainer(userId, {
      environment: {
        THREAD_ID: threadId,
        REPOSITORY_ID: repositoryId || '',
        REPOSITORY_URL: repositoryUrl || '',
        REPOSITORY_BRANCH: branch || 'main',
        WORKSPACE_PATH: `/workspace/${repositoryId || 'default'}`,
      },
      workDir: `/workspace/${repositoryId || 'default'}`,
      labels: {
        'ai-dev.thread-id': threadId,
        'ai-dev.user-id': userId,
        'ai-dev.repository-id': repositoryId || '',
        'ai-dev.created-at': new Date().toISOString(),
      }
    });

    // Clone repository if provided
    if (repositoryUrl) {
      await this.cloneRepository(containerId, repositoryUrl, branch || 'main');
    }

    // Create session record
    const session: ContainerSession = {
      containerId,
      userId,
      threadId,
      repositoryId,
      lastActivityAt: new Date(),
      createdAt: new Date(),
      isActive: true,
    };

    // Save session
    await this.saveSession(session);

    // Store in database
    await prisma.containerSession.create({
      data: {
        containerId,
        userId,
        threadId,
        repositoryId,
        lastActivityAt: new Date(),
        isActive: true,
      }
    });

    this.emit('container:created', { containerId, threadId, userId });

    return containerId;
  }

  /**
   * Update activity timestamp for a container
   */
  async updateActivity(containerId: string): Promise<void> {
    const session = this.containerSessions.get(containerId);

    if (session) {
      session.lastActivityAt = new Date();

      // Update in Redis for persistence
      await redis.set(
        `container:session:${containerId}`,
        JSON.stringify(session),
        'EX',
        3600 * 24 // Expire after 24 hours
      );

      // Update in database
      await prisma.containerSession.update({
        where: { containerId },
        data: { lastActivityAt: new Date() }
      }).catch(() => {
        // Ignore if not found
      });

      this.logger.debug(`Updated activity for container ${containerId}`);
    }
  }

  /**
   * Check for idle containers and clean them up
   */
  private startIdleChecker(): void {
    this.checkInterval = setInterval(async () => {
      await this.checkIdleContainers();
    }, this.CHECK_INTERVAL_MS);

    this.logger.info('Started idle container checker');
  }

  private async checkIdleContainers(): Promise<void> {
    const now = Date.now();
    const containersToCleanup: string[] = [];

    for (const [containerId, session] of this.containerSessions.entries()) {
      if (!session.isActive) continue;

      const idleTime = now - session.lastActivityAt.getTime();

      if (idleTime > this.IDLE_TIMEOUT_MS) {
        containersToCleanup.push(containerId);
      } else if (idleTime > this.IDLE_TIMEOUT_MS - this.GRACE_PERIOD_MS) {
        // Send warning about upcoming cleanup
        this.emit('container:idle-warning', {
          containerId,
          threadId: session.threadId,
          minutesRemaining: Math.floor((this.IDLE_TIMEOUT_MS - idleTime) / 60000)
        });
      }
    }

    // Clean up idle containers
    for (const containerId of containersToCleanup) {
      await this.cleanupContainer(containerId);
    }

    if (containersToCleanup.length > 0) {
      this.logger.info(`Cleaned up ${containersToCleanup.length} idle containers`);
    }
  }

  /**
   * Clean up a container and its session
   */
  private async cleanupContainer(containerId: string): Promise<void> {
    const session = this.containerSessions.get(containerId);

    if (!session) return;

    this.logger.info(`Cleaning up idle container ${containerId} for thread ${session.threadId}`);

    try {
      // Save any pending work
      await this.saveContainerState(containerId, session);

      // Stop and remove container
      await this.containerManager.stopContainer(containerId);
      await this.containerManager.removeContainer(containerId);

      // Mark session as inactive
      session.isActive = false;
      await this.cleanupSession(containerId);

      // Update database
      await prisma.containerSession.update({
        where: { containerId },
        data: {
          isActive: false,
          stoppedAt: new Date()
        }
      }).catch(() => {
        // Ignore if not found
      });

      this.emit('container:cleaned', {
        containerId,
        threadId: session.threadId,
        userId: session.userId,
        idleMinutes: Math.floor((Date.now() - session.lastActivityAt.getTime()) / 60000)
      });

    } catch (error) {
      this.logger.error(`Failed to cleanup container ${containerId}:`, error);
    }
  }

  /**
   * Save container state before cleanup
   */
  private async saveContainerState(containerId: string, session: ContainerSession): Promise<void> {
    try {
      // Get list of modified files
      const modifiedFiles = await this.containerManager.executeCommand(containerId, [
        'bash', '-c', 'git status --porcelain 2>/dev/null || true'
      ]);

      if (modifiedFiles.output && modifiedFiles.output.trim()) {
        // Commit any changes
        await this.containerManager.executeCommand(containerId, [
          'bash', '-c', `
            git add -A &&
            git commit -m "Auto-save: Container cleanup after idle timeout

Thread: ${session.threadId}
Timestamp: ${new Date().toISOString()}
Files modified: $(git status --porcelain | wc -l)

This commit was automatically created when the container was cleaned up after 45 minutes of inactivity." || true
          `
        ]);

        // Store commit hash
        const commitHash = await this.containerManager.executeCommand(containerId, [
          'bash', '-c', 'git rev-parse HEAD'
        ]);

        // Save state to Redis
        await redis.set(
          `container:state:${session.threadId}`,
          JSON.stringify({
            lastCommit: commitHash.output?.trim(),
            containerId,
            savedAt: new Date().toISOString(),
            modifiedFiles: modifiedFiles.output
          }),
          'EX',
          3600 * 24 * 7 // Keep for 7 days
        );

        this.logger.info(`Saved state for container ${containerId}, thread ${session.threadId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to save container state:`, error);
    }
  }

  /**
   * Restore container state when reactivating
   */
  async restoreContainerState(containerId: string, threadId: string): Promise<void> {
    try {
      const stateKey = `container:state:${threadId}`;
      const savedState = await redis.get(stateKey);

      if (savedState) {
        const state = JSON.parse(savedState);

        if (state.lastCommit) {
          // Reset to the last saved commit
          await this.containerManager.executeCommand(containerId, [
            'bash', '-c', `git reset --hard ${state.lastCommit} 2>/dev/null || true`
          ]);

          this.logger.info(`Restored state for container ${containerId} to commit ${state.lastCommit}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to restore container state:`, error);
    }
  }

  /**
   * Get session for a thread
   */
  private async getThreadSession(threadId: string): Promise<ContainerSession | null> {
    // Check memory cache first
    for (const session of this.containerSessions.values()) {
      if (session.threadId === threadId && session.isActive) {
        return session;
      }
    }

    // Check database
    const dbSession = await prisma.containerSession.findFirst({
      where: {
        threadId,
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (dbSession) {
      const session: ContainerSession = {
        containerId: dbSession.containerId,
        userId: dbSession.userId,
        threadId: dbSession.threadId,
        repositoryId: dbSession.repositoryId || undefined,
        sessionId: dbSession.sessionId || undefined,
        lastActivityAt: dbSession.lastActivityAt,
        createdAt: dbSession.createdAt,
        isActive: dbSession.isActive
      };

      // Add to cache
      this.containerSessions.set(dbSession.containerId, session);

      return session;
    }

    return null;
  }

  /**
   * Save session to persistent storage
   */
  private async saveSession(session: ContainerSession): Promise<void> {
    this.containerSessions.set(session.containerId, session);

    // Save to Redis
    await redis.set(
      `container:session:${session.containerId}`,
      JSON.stringify(session),
      'EX',
      3600 * 24 // Expire after 24 hours
    );
  }

  /**
   * Clean up session
   */
  private async cleanupSession(containerId: string): Promise<void> {
    this.containerSessions.delete(containerId);
    await redis.del(`container:session:${containerId}`);
  }

  /**
   * Load active sessions from storage
   */
  private async loadActiveSessions(): Promise<void> {
    try {
      // Load from database
      const sessions = await prisma.containerSession.findMany({
        where: { isActive: true }
      });

      for (const dbSession of sessions) {
        const session: ContainerSession = {
          containerId: dbSession.containerId,
          userId: dbSession.userId,
          threadId: dbSession.threadId,
          repositoryId: dbSession.repositoryId || undefined,
          sessionId: dbSession.sessionId || undefined,
          lastActivityAt: dbSession.lastActivityAt,
          createdAt: dbSession.createdAt,
          isActive: dbSession.isActive
        };

        this.containerSessions.set(dbSession.containerId, session);
      }

      this.logger.info(`Loaded ${sessions.length} active container sessions`);
    } catch (error) {
      this.logger.error('Failed to load active sessions:', error);
    }
  }

  /**
   * Save all active sessions
   */
  private async saveActiveSessions(): Promise<void> {
    const promises = [];

    for (const session of this.containerSessions.values()) {
      if (session.isActive) {
        promises.push(this.saveSession(session));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Clone repository into container
   */
  private async cloneRepository(containerId: string, repositoryUrl: string, branch: string): Promise<void> {
    await this.containerManager.executeCommand(containerId, [
      'bash', '-c', `
        cd /workspace &&
        git clone -b ${branch} ${repositoryUrl} . &&
        git config user.email "ai@dev.platform" &&
        git config user.name "AI Dev Assistant"
      `
    ]);
  }

  /**
   * Force cleanup of a specific thread's containers
   */
  async forceCleanupThread(threadId: string): Promise<void> {
    const session = await this.getThreadSession(threadId);

    if (session) {
      await this.cleanupContainer(session.containerId);
    }
  }

  /**
   * Get statistics about container usage
   */
  async getStatistics(): Promise<any> {
    const activeContainers = Array.from(this.containerSessions.values()).filter(s => s.isActive);

    return {
      activeContainers: activeContainers.length,
      totalSessions: this.containerSessions.size,
      oldestSession: activeContainers.reduce((oldest, session) => {
        return session.createdAt < oldest ? session.createdAt : oldest;
      }, new Date()),
      averageIdleTime: activeContainers.reduce((sum, session) => {
        return sum + (Date.now() - session.lastActivityAt.getTime());
      }, 0) / activeContainers.length / 60000, // in minutes
    };
  }
}