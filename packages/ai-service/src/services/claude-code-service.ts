import { EventEmitter } from 'events';
import { AIProvider, AIRequest, AIResponse, AIStreamChunk, ClaudeCodeSession } from '../types';
import { ServiceUnavailableError } from '@ai-dev/shared';
import { TmuxSessionManager, TmuxSession } from './tmux-session-manager';
import { ContainerManager } from '@ai-dev/container-service';

export class ClaudeCodeService extends EventEmitter implements AIProvider {
  public readonly name = 'claude-code';
  private activeSessions: Map<string, ClaudeCodeSession> = new Map();
  private tmuxSessionManager: TmuxSessionManager;

  constructor(containerManager: ContainerManager) {
    super();
    this.tmuxSessionManager = new TmuxSessionManager(containerManager);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test if we can list tmux sessions (indicating tmux and container access works)
      const testUserId = 'test';
      await this.tmuxSessionManager.getTmuxSessionList(testUserId);
      return true;
    } catch (error) {
      console.error('Claude Code availability check failed:', error);
      return false;
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    try {
      const startTime = Date.now();

      // Get or create tmux session for the user
      const tmuxSession = await this.getOrCreateTmuxSession(request.userId, request.context);

      // Send command to the Claude Code session
      const result = await this.tmuxSessionManager.sendCommandToSession(
        tmuxSession.sessionId,
        request.command
      );

      const duration = Date.now() - startTime;

      // Update session context
      await this.updateSessionContext(tmuxSession.sessionId, {
        previousCommands: [
          ...(this.activeSessions.get(tmuxSession.sessionId)?.context.previousCommands || []).slice(-10),
          request.command,
        ],
      });

      return {
        id: request.id,
        success: result.success,
        output: result.output || '',
        error: result.error,
        metadata: {
          sessionId: tmuxSession.sessionId,
          duration,
          workspaceRoot: tmuxSession.workspaceRoot,
        },
        usage: {
          inputTokens: 0, // Claude Code doesn't expose token usage directly
          outputTokens: 0,
          totalCost: 0,
        },
      };
    } catch (error) {
      console.error('Claude Code execution error:', error);

      return {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Claude Code execution failed',
      };
    }
  }

  async *streamExecute(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    try {
      // Get or create tmux session for the user
      const tmuxSession = await this.getOrCreateTmuxSession(request.userId, request.context);

      yield {
        type: 'output',
        content: 'Connecting to Claude Code session...\n\n',
      };

      // Send command to the Claude Code session
      const result = await this.tmuxSessionManager.sendCommandToSession(
        tmuxSession.sessionId,
        request.command
      );

      if (result.success) {
        yield {
          type: 'output',
          content: result.output || '',
        };
      } else {
        yield {
          type: 'error',
          content: result.error || 'Command execution failed',
        };
      }

      yield {
        type: 'complete',
        content: '',
      };

      // Update session context after completion
      await this.updateSessionContext(tmuxSession.sessionId, {
        previousCommands: [
          ...(this.activeSessions.get(tmuxSession.sessionId)?.context.previousCommands || []).slice(-10),
          request.command,
        ],
      });

    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Claude Code streaming failed',
      };
    }
  }


  private async getOrCreateTmuxSession(
    userId: string,
    context?: any
  ): Promise<TmuxSession> {
    // Look for existing tmux session
    const existingSessions = await this.tmuxSessionManager.listActiveSessions(userId);

    if (existingSessions.length > 0) {
      return existingSessions[0]; // Return the first active session
    }

    // Create new tmux session with Claude Code
    const workspaceRoot = context?.workingDirectory || `/workspace/users/${userId}`;
    return await this.tmuxSessionManager.createClaudeCodeSession(userId, workspaceRoot);
  }

  private buildClaudeCodePrompt(request: AIRequest): string {
    let prompt = `${request.command}\n\n`;

    if (request.context?.repositoryName) {
      prompt += `Repository: ${request.context.repositoryName}\n`;
    }

    if (request.context?.branch) {
      prompt += `Branch: ${request.context.branch}\n`;
    }

    if (request.context?.workingDirectory) {
      prompt += `Working Directory: ${request.context.workingDirectory}\n`;
    }

    if (request.context?.fileContents && request.context.fileContents.length > 0) {
      prompt += '\nRelevant Files:\n';
      for (const file of request.context.fileContents) {
        prompt += `\n${file.path}:\n\`\`\`\n${file.content}\n\`\`\`\n`;
      }
    }

    if (request.attachments && request.attachments.length > 0) {
      prompt += '\nAttachments:\n';
      for (const attachment of request.attachments) {
        prompt += `\n${attachment.filename} (${attachment.mimetype}):\n\`\`\`\n${attachment.content}\n\`\`\`\n`;
      }
    }

    if (request.options?.dryRun) {
      prompt += '\n\nDRY RUN: Only show what commands would be executed, do not actually run them.';
    }

    return prompt;
  }

  private async getOrCreateSession(
    userId: string,
    context?: any
  ): Promise<ClaudeCodeSession> {
    // Look for existing active session
    const existingSession = Array.from(this.activeSessions.values()).find(
      session => session.userId === userId && session.isActive
    );

    if (existingSession) {
      existingSession.lastActivity = new Date();
      return existingSession;
    }

    // Create new session (this now wraps the tmux session)
    const tmuxSession = await this.getOrCreateTmuxSession(userId, context);

    const session: ClaudeCodeSession = {
      sessionId: tmuxSession.sessionId,
      userId,
      containerId: '', // TODO: Integrate with container service
      workspaceRoot: tmuxSession.workspaceRoot,
      isActive: true,
      lastActivity: new Date(),
      context: {
        workingDirectory: tmuxSession.workspaceRoot,
        repositoryPath: context?.repositoryPath,
        repositoryName: context?.repositoryName,
        branch: context?.branch,
        environment: context?.environment || {},
        previousCommands: [],
      },
    };

    this.activeSessions.set(tmuxSession.sessionId, session);

    this.emit('session:created', {
      sessionId: tmuxSession.sessionId,
      userId,
      workspaceRoot: tmuxSession.workspaceRoot,
    });

    return session;
  }

  private async updateSessionContext(
    sessionId: string,
    updates: Partial<ClaudeCodeSession['context']>
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.context = { ...session.context, ...updates };
      session.lastActivity = new Date();

      this.emit('session:updated', {
        sessionId,
        context: session.context,
      });
    }
  }

  async createSession(
    userId: string,
    workspaceRoot: string,
    options?: {
      repositoryPath?: string;
      repositoryName?: string;
      branch?: string;
      environment?: Record<string, string>;
    }
  ): Promise<string> {
    const session = await this.getOrCreateSession(userId, {
      workingDirectory: workspaceRoot,
      ...options,
    });

    return session.sessionId;
  }

  async getSession(sessionId: string): Promise<ClaudeCodeSession | null> {
    return this.activeSessions.get(sessionId) || null;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      // Close the tmux session
      await this.tmuxSessionManager.closeSession(sessionId);

      session.isActive = false;
      this.activeSessions.delete(sessionId);

      this.emit('session:closed', { sessionId });
    }
  }

  async listActiveSessions(userId?: string): Promise<ClaudeCodeSession[]> {
    const sessions = Array.from(this.activeSessions.values()).filter(
      session => session.isActive && (!userId || session.userId === userId)
    );

    return sessions;
  }

  async executeInSession(
    sessionId: string,
    command: string,
    _options?: {
      timeout?: number;
      yoloMode?: boolean;
    }
  ): Promise<AIResponse> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const startTime = Date.now();

    // Send command directly to the tmux session
    const result = await this.tmuxSessionManager.sendCommandToSession(sessionId, command);

    const duration = Date.now() - startTime;

    return {
      id: `session_exec_${Date.now()}`,
      success: result.success,
      output: result.output || '',
      error: result.error,
      metadata: {
        sessionId,
        duration,
        workspaceRoot: session.workspaceRoot,
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
      },
    };
  }

  // Get tmux session output for debugging
  async getSessionOutput(sessionId: string, lines: number = 50): Promise<string> {
    return await this.tmuxSessionManager.getSessionOutput(sessionId, lines);
  }

  // Restart Claude Code in a session
  async restartClaudeCodeInSession(sessionId: string): Promise<boolean> {
    return await this.tmuxSessionManager.restartClaudeCodeInSession(sessionId);
  }

  // Cleanup inactive sessions
  async cleanupInactiveSessions(maxInactiveTime: number = 30 * 60 * 1000): Promise<void> {
    // Clean up tmux sessions first
    await this.tmuxSessionManager.cleanupInactiveSessions(maxInactiveTime);

    // Then clean up our local session tracking
    const now = Date.now();
    const sessionsToClose: string[] = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity.getTime() > maxInactiveTime) {
        sessionsToClose.push(sessionId);
      }
    }

    for (const sessionId of sessionsToClose) {
      // Just remove from local tracking (tmux cleanup already handled above)
      this.activeSessions.delete(sessionId);
      console.info(`Cleaned up inactive Claude Code session tracking: ${sessionId}`);
    }
  }

  async getServiceStatus(): Promise<{
    available: boolean;
    activeSessions: number;
    totalSessions: number;
  }> {
    const available = await this.isAvailable();
    const activeSessions = Array.from(this.activeSessions.values()).filter(s => s.isActive).length;

    return {
      available,
      activeSessions,
      totalSessions: this.activeSessions.size,
    };
  }
}