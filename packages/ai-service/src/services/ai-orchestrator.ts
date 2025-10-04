import { EventEmitter } from 'events';
import { ClaudeService } from './claude-service';
import { OpenAIService } from './openai-service';
import { ClaudeCodeService } from './claude-code-service';
import { CommandExecutor } from './command-executor';
import { ContextManager } from './context-manager';
import { ContainerManager } from '@ai-dev/container-service';
import { prisma } from '@ai-dev/database';
import {
  AIProvider,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIServiceConfig,
  ClaudeCodeSession,
} from '../types';
import { ServiceUnavailableError, encryptData, decryptData } from '@ai-dev/shared';

export class AIOrchestrator extends EventEmitter {
  private claudeService: ClaudeService;
  private claudeCodeService: ClaudeCodeService;
  private openaiService: OpenAIService;
  private commandExecutor: CommandExecutor;
  private contextManager: ContextManager;
  private containerManager: ContainerManager;
  private config: AIServiceConfig;
  private requestQueue: Map<string, AIRequest> = new Map();

  constructor(config: AIServiceConfig, containerManager: ContainerManager) {
    super();
    this.config = config;
    this.containerManager = containerManager;
    this.claudeService = new ClaudeService();
    this.claudeCodeService = new ClaudeCodeService(containerManager);
    this.openaiService = new OpenAIService();
    this.commandExecutor = new CommandExecutor();
    this.contextManager = new ContextManager();

    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    try {
      console.info('Initializing AI Orchestrator...');

      // Set default API keys if provided
      if (this.config.claudeApiKey) {
        await this.claudeService.setApiKey(this.config.claudeApiKey);
      }

      if (this.config.openaiApiKey) {
        await this.openaiService.setApiKey(this.config.openaiApiKey);
      }

      console.info('✅ AI Orchestrator initialized');
    } catch (error) {
      console.error('Failed to initialize AI Orchestrator:', error);
      throw error;
    }
  }

  async executeRequest(request: AIRequest): Promise<AIResponse> {
    try {
      // Store request in queue
      this.requestQueue.set(request.id, request);

      // Get user's API tokens
      await this.loadUserApiTokens(request.userId);

      // Determine which provider to use
      const provider = await this.selectProvider(request);

      // Build context for the request
      const context = await this.contextManager.buildContext(request);
      const enhancedRequest = { ...request, context };

      this.emit('request:started', { requestId: request.id, provider: provider.name });

      // Execute the request
      const response = await provider.execute(enhancedRequest);

      // If the response contains commands and not in dry run mode, execute them
      if (response.executedCommands && !request.options?.dryRun) {
        const executionResults = await this.executeCommands(
          request.userId,
          response.executedCommands,
          context
        );

        response.executedCommands = executionResults;
      }

      this.emit('request:completed', { requestId: request.id, success: response.success });

      // Clean up
      this.requestQueue.delete(request.id);

      return response;
    } catch (error) {
      this.emit('request:failed', { requestId: request.id, error });
      this.requestQueue.delete(request.id);

      return {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async *streamExecuteRequest(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    try {
      // Store request in queue
      this.requestQueue.set(request.id, request);

      // Get user's API tokens
      await this.loadUserApiTokens(request.userId);

      // Determine which provider to use
      const provider = await this.selectProvider(request);

      // Build context for the request
      const context = await this.contextManager.buildContext(request);
      const enhancedRequest = { ...request, context };

      this.emit('request:started', { requestId: request.id, provider: provider.name });

      // Stream the execution
      if (provider.streamExecute) {
        for await (const chunk of provider.streamExecute(enhancedRequest)) {
          yield chunk;

          // Execute commands as they come in if in YOLO mode
          if (chunk.type === 'command' && request.options?.yoloMode && !request.options?.dryRun) {
            try {
              const result = await this.executeCommand(request.userId, chunk.content, context);
              yield {
                type: 'output',
                content: `\nCommand executed: ${chunk.content}\nOutput: ${result.stdout}\n`,
                metadata: { executionResult: result },
              };
            } catch (error) {
              yield {
                type: 'error',
                content: `Command execution failed: ${error}`,
              };
            }
          }
        }
      } else {
        // Fallback to non-streaming
        const response = await provider.execute(enhancedRequest);
        yield {
          type: 'output',
          content: response.output || '',
        };

        if (response.error) {
          yield {
            type: 'error',
            content: response.error,
          };
        }

        yield {
          type: 'complete',
          content: '',
          metadata: response.metadata,
        };
      }

      this.emit('request:completed', { requestId: request.id, success: true });

      // Clean up
      this.requestQueue.delete(request.id);
    } catch (error) {
      this.emit('request:failed', { requestId: request.id, error });
      this.requestQueue.delete(request.id);

      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async createSession(userId: string, workspaceRoot: string, options?: {
    repositoryPath?: string;
    repositoryName?: string;
    branch?: string;
    environment?: Record<string, string>;
  }): Promise<string> {
    // Create session using Claude Code service
    const sessionId = await this.claudeCodeService.createSession(userId, workspaceRoot, options);

    this.emit('session:created', { sessionId, userId });

    return sessionId;
  }

  async getSession(sessionId: string): Promise<ClaudeCodeSession | null> {
    return await this.claudeCodeService.getSession(sessionId);
  }

  async listActiveSessions(userId?: string): Promise<ClaudeCodeSession[]> {
    return await this.claudeCodeService.listActiveSessions(userId);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.claudeCodeService.closeSession(sessionId);
    this.emit('session:closed', { sessionId });
  }

  async executeInSession(sessionId: string, command: string, options?: {
    timeout?: number;
    yoloMode?: boolean;
  }): Promise<AIResponse> {
    return await this.claudeCodeService.executeInSession(sessionId, command, options);
  }

  async analyzeCommand(userId: string, command: string): Promise<any> {
    await this.loadUserApiTokens(userId);

    const provider = this.claudeService; // Use Claude for analysis
    if (provider instanceof ClaudeService) {
      return await provider.analyzeCommand(command);
    }

    // Fallback basic analysis
    return {
      type: 'potentially_dangerous',
      commands: [command],
      risks: ['Unable to analyze with current provider'],
      filesAffected: [],
      networkAccess: true,
      systemAccess: true,
      dataAccess: true,
      confidence: 0.5,
    };
  }

  private async selectProvider(request: AIRequest): Promise<AIProvider> {
    const requestedProvider = request.options?.provider || this.config.defaultProvider;

    // Prioritize Claude Code for development tasks
    if (requestedProvider === 'claude-code' ||
        (requestedProvider === 'auto' && this.isCodeRequest(request))) {
      if (await this.claudeCodeService.isAvailable()) {
        return this.claudeCodeService;
      }
    }

    if (requestedProvider === 'claude') {
      if (await this.claudeService.isAvailable()) {
        return this.claudeService;
      }
    }

    if (requestedProvider === 'openai') {
      if (await this.openaiService.isAvailable()) {
        return this.openaiService;
      }
    }

    if (requestedProvider === 'auto') {
      // Try Claude Code first for code tasks, then Claude, then OpenAI
      if (this.isCodeRequest(request) && await this.claudeCodeService.isAvailable()) {
        return this.claudeCodeService;
      }
      if (await this.claudeService.isAvailable()) {
        return this.claudeService;
      }
      if (await this.openaiService.isAvailable()) {
        return this.openaiService;
      }
    }

    throw new ServiceUnavailableError('AI Provider', 'No available AI providers');
  }

  private isCodeRequest(request: AIRequest): boolean {
    const codeKeywords = [
      'code', 'debug', 'test', 'build', 'compile', 'run', 'execute',
      'git', 'npm', 'yarn', 'pnpm', 'docker', 'file', 'directory',
      'create', 'edit', 'modify', 'delete', 'script', 'command'
    ];

    const command = request.command.toLowerCase();
    return codeKeywords.some(keyword => command.includes(keyword)) ||
           !!request.context?.repositoryName ||
           !!request.context?.workingDirectory;
  }

  private async loadUserApiTokens(userId: string): Promise<void> {
    try {
      const tokens = await prisma.apiToken.findMany({
        where: {
          userId,
          isActive: true,
        },
      });

      for (const token of tokens) {
        const decryptedToken = decryptData(
          token.encryptedToken,
          process.env.ENCRYPTION_KEY || 'default-key'
        );

        switch (token.service) {
          case 'anthropic':
            await this.claudeService.setApiKey(decryptedToken);
            break;
          case 'openai':
            await this.openaiService.setApiKey(decryptedToken);
            break;
        }
      }
    } catch (error) {
      console.error(`Failed to load API tokens for user ${userId}:`, error);
    }
  }

  private async executeCommands(
    userId: string,
    commands: any[],
    context: any
  ): Promise<any[]> {
    const results = [];

    for (const command of commands) {
      try {
        const result = await this.executeCommand(userId, command.command, context);
        results.push(result);
      } catch (error) {
        results.push({
          command: command.command,
          exitCode: 1,
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  private async executeCommand(userId: string, command: string, _context: any): Promise<any> {
    // Get user's Claude Code sessions
    const userSessions = await this.claudeCodeService.listActiveSessions(userId);

    if (userSessions.length === 0) {
      throw new Error('No active Claude Code session found for user');
    }

    const session = userSessions[0]; // Use the first active session

    // Execute command in the Claude Code session
    const response = await this.claudeCodeService.executeInSession(
      session.sessionId,
      command
    );

    return {
      command,
      exitCode: response.success ? 0 : 1,
      stdout: response.output || '',
      stderr: response.error || '',
      duration: response.metadata?.duration || 0,
      timestamp: new Date(),
    };
  }

  private setupEventHandlers(): void {
    // Handle session cleanup - delegate to Claude Code service
    setInterval(async () => {
      await this.cleanupInactiveSessions();
    }, 5 * 60 * 1000); // Every 5 minutes

    // Handle request timeouts
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 30 * 1000); // Every 30 seconds
  }

  private async cleanupInactiveSessions(): Promise<void> {
    try {
      await this.claudeCodeService.cleanupInactiveSessions();
      console.info('Cleaned up inactive Claude Code sessions');
    } catch (error) {
      console.error('Failed to cleanup inactive sessions:', error);
    }
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();
    const maxRequestTime = this.config.requestTimeout || 5 * 60 * 1000; // 5 minutes

    for (const [requestId, request] of this.requestQueue.entries()) {
      // Assuming request has a timestamp property
      const requestTime = parseInt(requestId.split('_')[1]) || now;
      if (now - requestTime > maxRequestTime) {
        this.requestQueue.delete(requestId);
        this.emit('request:timeout', { requestId });
        console.info(`Cleaned up expired request: ${requestId}`);
      }
    }
  }

  async getServiceStatus(): Promise<{
    claude: boolean;
    claudeCode: boolean;
    openai: boolean;
    activeSessions: number;
    queuedRequests: number;
    claudeCodeStatus?: any;
  }> {
    const [claudeAvailable, claudeCodeAvailable, openaiAvailable] = await Promise.all([
      this.claudeService.isAvailable(),
      this.claudeCodeService.isAvailable(),
      this.openaiService.isAvailable(),
    ]);

    const claudeCodeStatus = await this.claudeCodeService.getServiceStatus();

    return {
      claude: claudeAvailable,
      claudeCode: claudeCodeAvailable,
      openai: openaiAvailable,
      activeSessions: claudeCodeStatus.activeSessions,
      queuedRequests: this.requestQueue.size,
      claudeCodeStatus,
    };
  }
}