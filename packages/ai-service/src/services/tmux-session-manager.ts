import { EventEmitter } from 'events';
import { ExecResult } from '../types';
import { ContainerManager } from '@ai-dev/container-service';

export interface TmuxSession {
  sessionId: string;
  userId: string;
  sessionName: string;
  windowName: string;
  workspaceRoot: string;
  isActive: boolean;
  lastActivity: Date;
  claudeCodePid?: number;
}

export class TmuxSessionManager extends EventEmitter {
  private activeSessions: Map<string, TmuxSession> = new Map();
  private containerManager: ContainerManager;

  constructor(containerManager: ContainerManager) {
    super();
    this.containerManager = containerManager;
  }

  async createClaudeCodeSession(
    userId: string,
    workspaceRoot: string = '/workspace'
  ): Promise<TmuxSession> {
    const sessionName = `claude-code-${userId}`;
    const windowName = 'main';
    const sessionId = `${userId}:${sessionName}`;

    // Check if session already exists
    const existingSession = this.activeSessions.get(sessionId);
    if (existingSession && existingSession.isActive) {
      existingSession.lastActivity = new Date();
      return existingSession;
    }

    try {
      // Create new tmux session with Claude Code
      await this.executeInContainer(userId, [
        'tmux', 'new-session', '-d', '-s', sessionName, '-c', workspaceRoot
      ]);

      // Set the window name
      await this.executeInContainer(userId, [
        'tmux', 'rename-window', '-t', `${sessionName}:0`, windowName
      ]);

      // Start Claude Code in the tmux session
      await this.executeInContainer(userId, [
        'tmux', 'send-keys', '-t', `${sessionName}:${windowName}`, 'claude-code', 'Enter'
      ]);

      // Wait a moment for Claude Code to start
      await this.sleep(2000);

      const session: TmuxSession = {
        sessionId,
        userId,
        sessionName,
        windowName,
        workspaceRoot,
        isActive: true,
        lastActivity: new Date(),
      };

      this.activeSessions.set(sessionId, session);

      this.emit('session:created', session);

      console.info(`Created Claude Code tmux session: ${sessionId}`);
      return session;
    } catch (error) {
      console.error(`Failed to create Claude Code session for user ${userId}:`, error);
      throw error;
    }
  }

  async sendCommandToSession(
    sessionId: string,
    command: string
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) {
      throw new Error(`Session ${sessionId} not found or inactive`);
    }

    try {
      // Send command to the Claude Code session
      await this.executeInContainer(session.userId, [
        'tmux', 'send-keys', '-t', `${session.sessionName}:${session.windowName}`,
        command, 'Enter'
      ]);

      // Update last activity
      session.lastActivity = new Date();

      // Wait a moment for command to execute
      await this.sleep(1000);

      // Capture the output from the tmux session
      const output = await this.captureSessionOutput(session);

      this.emit('command:sent', { sessionId, command, output });

      return {
        success: true,
        output,
      };
    } catch (error) {
      console.error(`Failed to send command to session ${sessionId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async captureSessionOutput(session: TmuxSession): Promise<string> {
    try {
      // Capture the last few lines from the tmux session
      const result = await this.executeInContainer(session.userId, [
        'tmux', 'capture-pane', '-t', `${session.sessionName}:${session.windowName}`,
        '-p', '-S', '-20' // Get last 20 lines
      ]);

      return result.stdout || '';
    } catch (error) {
      console.error(`Failed to capture output from session ${session.sessionId}:`, error);
      return '';
    }
  }

  async getSessionStatus(sessionId: string): Promise<{
    exists: boolean;
    isResponsive: boolean;
    lastOutput?: string;
  }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { exists: false, isResponsive: false };
    }

    try {
      // Check if tmux session exists
      await this.executeInContainer(session.userId, [
        'tmux', 'has-session', '-t', session.sessionName
      ]);

      // Try to capture output to see if it's responsive
      const output = await this.captureSessionOutput(session);

      return {
        exists: true,
        isResponsive: true,
        lastOutput: output,
      };
    } catch (error) {
      return {
        exists: false,
        isResponsive: false,
      };
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      // Kill the tmux session
      await this.executeInContainer(session.userId, [
        'tmux', 'kill-session', '-t', session.sessionName
      ]);

      session.isActive = false;
      this.activeSessions.delete(sessionId);

      this.emit('session:closed', { sessionId });

      console.info(`Closed Claude Code session: ${sessionId}`);
    } catch (error) {
      console.error(`Failed to close session ${sessionId}:`, error);
    }
  }

  async listActiveSessions(userId?: string): Promise<TmuxSession[]> {
    const sessions = Array.from(this.activeSessions.values()).filter(
      session => session.isActive && (!userId || session.userId === userId)
    );

    return sessions;
  }

  async restartClaudeCodeInSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Send Ctrl+C to stop current Claude Code instance
      await this.executeInContainer(session.userId, [
        'tmux', 'send-keys', '-t', `${session.sessionName}:${session.windowName}`,
        'C-c'
      ]);

      await this.sleep(1000);

      // Clear the screen
      await this.executeInContainer(session.userId, [
        'tmux', 'send-keys', '-t', `${session.sessionName}:${session.windowName}`,
        'clear', 'Enter'
      ]);

      await this.sleep(500);

      // Restart Claude Code
      await this.executeInContainer(session.userId, [
        'tmux', 'send-keys', '-t', `${session.sessionName}:${session.windowName}`,
        'claude-code', 'Enter'
      ]);

      await this.sleep(2000);

      this.emit('session:restarted', { sessionId });

      return true;
    } catch (error) {
      console.error(`Failed to restart Claude Code in session ${sessionId}:`, error);
      return false;
    }
  }

  async cleanupInactiveSessions(maxInactiveTime: number = 30 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const sessionsToClose: string[] = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity.getTime() > maxInactiveTime) {
        sessionsToClose.push(sessionId);
      }
    }

    for (const sessionId of sessionsToClose) {
      await this.closeSession(sessionId);
      console.info(`Cleaned up inactive Claude Code session: ${sessionId}`);
    }
  }

  private async executeInContainer(
    userId: string,
    command: string[]
  ): Promise<ExecResult> {
    try {
      return await this.containerManager.executeCommand(userId, command, {
        tty: false,
        workDir: '/workspace',
      });
    } catch (error) {
      console.error(`Failed to execute command in container for user ${userId}:`, error);
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTmuxSessionList(userId: string): Promise<string[]> {
    try {
      const result = await this.executeInContainer(userId, [
        'tmux', 'list-sessions', '-F', '#{session_name}'
      ]);

      return result.stdout.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
      return [];
    }
  }

  async attachToSession(sessionId: string): Promise<string> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Return the tmux attach command for external use
    return `tmux attach-session -t ${session.sessionName}`;
  }

  getSession(sessionId: string): TmuxSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  async getSessionOutput(sessionId: string, lines: number = 50): Promise<string> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      const result = await this.executeInContainer(session.userId, [
        'tmux', 'capture-pane', '-t', `${session.sessionName}:${session.windowName}`,
        '-p', '-S', `-${lines}`
      ]);

      return result.stdout || '';
    } catch (error) {
      console.error(`Failed to get session output for ${sessionId}:`, error);
      return '';
    }
  }
}