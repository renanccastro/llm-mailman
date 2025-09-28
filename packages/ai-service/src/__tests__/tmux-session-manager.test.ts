import { TmuxSessionManager } from '../services/tmux-session-manager';
import { ContainerManager } from '@ai-dev/container-service';

// Mock the container manager
jest.mock('@ai-dev/container-service');

describe('TmuxSessionManager', () => {
  let tmuxSessionManager: TmuxSessionManager;
  let mockContainerManager: jest.Mocked<ContainerManager>;

  beforeEach(() => {
    mockContainerManager = {
      executeCommand: jest.fn(),
    } as any;

    tmuxSessionManager = new TmuxSessionManager(mockContainerManager);
  });

  describe('createClaudeCodeSession', () => {
    it('should create a new tmux session with Claude Code', async () => {
      const userId = 'test-user';
      const workspaceRoot = '/workspace/test';

      // Mock successful command executions
      mockContainerManager.executeCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 100 }) // tmux new-session
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 100 }) // tmux rename-window
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 100 }); // tmux send-keys

      const session = await tmuxSessionManager.createClaudeCodeSession(userId, workspaceRoot);

      expect(session).toMatchObject({
        userId,
        workspaceRoot,
        sessionName: `claude-code-${userId}`,
        windowName: 'main',
        isActive: true,
      });

      expect(mockContainerManager.executeCommand).toHaveBeenCalledTimes(3);

      // Verify tmux commands were called correctly
      expect(mockContainerManager.executeCommand).toHaveBeenNthCalledWith(1, userId, [
        'tmux', 'new-session', '-d', '-s', `claude-code-${userId}`, '-c', workspaceRoot
      ], { tty: false, workDir: '/workspace' });

      expect(mockContainerManager.executeCommand).toHaveBeenNthCalledWith(2, userId, [
        'tmux', 'rename-window', '-t', `claude-code-${userId}:0`, 'main'
      ], { tty: false, workDir: '/workspace' });

      expect(mockContainerManager.executeCommand).toHaveBeenNthCalledWith(3, userId, [
        'tmux', 'send-keys', '-t', `claude-code-${userId}:main`, 'claude-code', 'Enter'
      ], { tty: false, workDir: '/workspace' });
    });

    it('should return existing session if already active', async () => {
      const userId = 'test-user';
      const workspaceRoot = '/workspace/test';

      // Create first session
      mockContainerManager.executeCommand
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 100 });

      const firstSession = await tmuxSessionManager.createClaudeCodeSession(userId, workspaceRoot);

      // Reset the mock to ensure no new calls are made
      mockContainerManager.executeCommand.mockClear();

      // Try to create again - should return existing
      const secondSession = await tmuxSessionManager.createClaudeCodeSession(userId, workspaceRoot);

      expect(firstSession.sessionId).toBe(secondSession.sessionId);
      expect(mockContainerManager.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('sendCommandToSession', () => {
    it('should send command to tmux session', async () => {
      const userId = 'test-user';
      const command = 'help';

      // Setup session first
      mockContainerManager.executeCommand
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 100 });

      const session = await tmuxSessionManager.createClaudeCodeSession(userId);

      // Mock command execution and output capture
      mockContainerManager.executeCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 100 }) // send-keys
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'Command output', stderr: '', duration: 100 }); // capture-pane

      const result = await tmuxSessionManager.sendCommandToSession(session.sessionId, command);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Command output');

      // Verify command was sent correctly
      expect(mockContainerManager.executeCommand).toHaveBeenCalledWith(userId, [
        'tmux', 'send-keys', '-t', `${session.sessionName}:${session.windowName}`,
        command, 'Enter'
      ], { tty: false, workDir: '/workspace' });
    });

    it('should handle command execution errors', async () => {
      const userId = 'test-user';
      const command = 'invalid-command';

      // Setup session first
      mockContainerManager.executeCommand
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 100 });

      const session = await tmuxSessionManager.createClaudeCodeSession(userId);

      // Mock command execution failure
      mockContainerManager.executeCommand
        .mockRejectedValueOnce(new Error('Command failed'));

      const result = await tmuxSessionManager.sendCommandToSession(session.sessionId, command);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Command failed');
    });
  });

  describe('session lifecycle', () => {
    it('should list active sessions for user', async () => {
      const userId = 'test-user';

      mockContainerManager.executeCommand
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 100 });

      await tmuxSessionManager.createClaudeCodeSession(userId);

      const sessions = await tmuxSessionManager.listActiveSessions(userId);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].userId).toBe(userId);
    });

    it('should close session and clean up', async () => {
      const userId = 'test-user';

      mockContainerManager.executeCommand
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 100 });

      const session = await tmuxSessionManager.createClaudeCodeSession(userId);

      // Mock tmux kill-session
      mockContainerManager.executeCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 100 });

      await tmuxSessionManager.closeSession(session.sessionId);

      const sessions = await tmuxSessionManager.listActiveSessions(userId);
      expect(sessions).toHaveLength(0);

      // Verify kill command was called
      expect(mockContainerManager.executeCommand).toHaveBeenCalledWith(userId, [
        'tmux', 'kill-session', '-t', session.sessionName
      ], { tty: false, workDir: '/workspace' });
    });
  });
});