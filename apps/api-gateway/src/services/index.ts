import { AIOrchestrator } from '@ai-dev/ai-service';
import { ContainerManager, ContainerLifecycleManager } from '@ai-dev/container-service';
import { CommunicationService } from '@ai-dev/communication-service';
import { AuthService } from '@ai-dev/auth-service';

// Global service instances
export let aiOrchestrator: AIOrchestrator;
export let containerManager: ContainerManager;
export let containerLifecycleManager: ContainerLifecycleManager;
export let communicationService: CommunicationService;
export let authService: AuthService;

export interface ServiceConfig {
  claudeApiKey?: string;
  openaiApiKey?: string;
  defaultProvider?: string;
  requestTimeout?: number;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  sendgridApiKey?: string;
  whatsappConfig?: {
    apiKey: string;
    phoneNumberId: string;
    accessToken: string;
  };
}

export async function initializeServices(config?: ServiceConfig): Promise<void> {
  try {
    console.info('🔧 Initializing services...');

    // Initialize container manager first
    containerManager = new ContainerManager();
    await containerManager.initialize();
    console.info('✅ Container Manager initialized');

    // Initialize container lifecycle manager
    containerLifecycleManager = new ContainerLifecycleManager(containerManager);
    await containerLifecycleManager.initialize();
    console.info('✅ Container Lifecycle Manager initialized');

    // Initialize AI orchestrator with container manager dependency
    const aiConfig = {
      claudeApiKey: config?.claudeApiKey || process.env.CLAUDE_API_KEY,
      openaiApiKey: config?.openaiApiKey || process.env.OPENAI_API_KEY,
      defaultProvider: config?.defaultProvider || process.env.DEFAULT_AI_PROVIDER || 'claude-code',
      requestTimeout: config?.requestTimeout || 300000, // 5 minutes
    };

    aiOrchestrator = new AIOrchestrator(aiConfig, containerManager);
    await aiOrchestrator.initialize();
    console.info('✅ AI Orchestrator initialized');

    // Initialize communication service
    const commConfig = {
      smtp: config?.smtpConfig || {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      },
      sendgrid: {
        apiKey: config?.sendgridApiKey || process.env.SENDGRID_API_KEY || '',
      },
      whatsapp: config?.whatsappConfig || {
        apiKey: process.env.WHATSAPP_API_KEY || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      },
    };

    communicationService = new CommunicationService(commConfig);
    await communicationService.initialize();
    console.info('✅ Communication Service initialized');

    // Initialize auth service
    const authConfig = {
      jwtSecret: process.env.JWT_SECRET || 'dev-secret',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      githubClientId: process.env.GITHUB_CLIENT_ID || '',
      githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      githubCallbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/v1/auth/github/callback',
      encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key',
    };

    authService = new AuthService(authConfig);
    console.info('✅ Auth Service initialized');

    console.info('🎉 All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

export async function shutdownServices(): Promise<void> {
  try {
    console.info('🔄 Shutting down services...');

    if (aiOrchestrator) {
      // Clean up any active sessions
      await aiOrchestrator.cleanupInactiveSessions();
    }

    if (containerLifecycleManager) {
      // Save container states and shutdown
      await containerLifecycleManager.shutdown();
    }

    if (communicationService) {
      await communicationService.shutdown();
    }

    console.info('✅ Services shut down successfully');
  } catch (error) {
    console.error('❌ Error during service shutdown:', error);
  }
}

// Export service status function
export async function getServicesStatus() {
  try {
    const [aiStatus, containerStatus, commStatus] = await Promise.all([
      aiOrchestrator?.getServiceStatus(),
      containerManager ? { available: true } : { available: false },
      communicationService?.getStatus(),
    ]);

    return {
      ai: aiStatus,
      container: containerStatus,
      communication: commStatus,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to get status',
      timestamp: new Date().toISOString(),
    };
  }
}