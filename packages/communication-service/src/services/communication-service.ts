import { EventEmitter } from 'events';
import { EmailService } from './email-service';
import { WhatsAppService } from './whatsapp-service';
import { NotificationService } from './notification-service';
import { MessageParser } from './message-parser';
import { AttachmentHandler } from './attachment-handler';
import { EmailMessage, WhatsAppMessage, NotificationMessage, IncomingMessage } from '../types';

export interface CommunicationConfig {
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  sendgrid?: {
    apiKey: string;
  };
  whatsapp?: {
    apiKey: string;
    phoneNumberId: string;
    accessToken: string;
  };
}

export class CommunicationService extends EventEmitter {
  private emailService: EmailService;
  private whatsAppService: WhatsAppService;
  private notificationService: NotificationService;
  private messageParser: MessageParser;
  private attachmentHandler: AttachmentHandler;
  private config: CommunicationConfig;

  constructor(config: CommunicationConfig) {
    super();
    this.config = config;

    // Initialize services
    this.emailService = new EmailService();
    this.whatsAppService = new WhatsAppService();
    this.notificationService = new NotificationService();
    this.messageParser = new MessageParser();
    this.attachmentHandler = new AttachmentHandler();

    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    try {
      console.info('🔧 Initializing Communication Service...');

      // Test connections
      const emailReady = await this.emailService.testConnection();
      const whatsappReady = await this.whatsAppService.testConnection();

      console.info(`📧 Email Service: ${emailReady ? '✅ Ready' : '⚠️ Not configured'}`);
      console.info(`📱 WhatsApp Service: ${whatsappReady ? '✅ Ready' : '⚠️ Not configured'}`);

      console.info('✅ Communication Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Communication Service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      console.info('🔄 Shutting down Communication Service...');
      // Clean up any active connections or listeners
      this.removeAllListeners();
      console.info('✅ Communication Service shut down');
    } catch (error) {
      console.error('❌ Error shutting down Communication Service:', error);
    }
  }

  // Email methods
  async sendEmail(message: EmailMessage): Promise<{ messageId?: string; sent: boolean }> {
    try {
      const sent = await this.emailService.sendEmail(message);
      return { sent, messageId: `email_${Date.now()}` };
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  async sendConfirmationEmail(
    to: string,
    requestId: string,
    command: string,
    token: string,
    expiresAt: Date
  ): Promise<boolean> {
    return await this.emailService.sendConfirmationEmail(to, requestId, command, token, expiresAt);
  }

  async sendExecutionNotification(
    to: string,
    requestId: string,
    command: string,
    success: boolean,
    output?: string,
    error?: string
  ): Promise<boolean> {
    return await this.emailService.sendExecutionNotification(to, requestId, command, success, output, error);
  }

  async generateUserInbox(userId: string): Promise<string> {
    return await this.emailService.generateUserInbox(userId);
  }

  async getUserFromInboxEmail(email: string): Promise<string | null> {
    return await this.emailService.getUserFromInboxEmail(email);
  }

  // WhatsApp methods
  async sendWhatsApp(message: WhatsAppMessage): Promise<{ messageId?: string; sent: boolean }> {
    try {
      const sent = await this.whatsAppService.sendMessage(message);
      return { sent, messageId: `whatsapp_${Date.now()}` };
    } catch (error) {
      console.error('Failed to send WhatsApp:', error);
      throw error;
    }
  }

  async sendWhatsAppConfirmation(
    to: string,
    requestId: string,
    command: string,
    token: string,
    expiresAt: Date
  ): Promise<boolean> {
    return await this.whatsAppService.sendConfirmationMessage(to, requestId, command, token, expiresAt);
  }

  async sendWhatsAppNotification(
    to: string,
    requestId: string,
    command: string,
    success: boolean,
    output?: string,
    error?: string
  ): Promise<boolean> {
    return await this.whatsAppService.sendExecutionNotification(to, requestId, command, success, output, error);
  }

  // Generic notification method
  async sendNotification(notification: NotificationMessage): Promise<boolean> {
    try {
      switch (notification.channel) {
        case 'EMAIL':
          if (notification.type === 'confirmation') {
            return await this.sendConfirmationEmail(
              notification.data.to,
              notification.data.requestId,
              notification.data.command,
              notification.data.token,
              notification.data.expiresAt
            );
          } else if (notification.type === 'completion') {
            return await this.sendExecutionNotification(
              notification.data.to,
              notification.data.requestId,
              notification.data.command,
              notification.data.success,
              notification.data.output,
              notification.data.error
            );
          }
          break;

        case 'WHATSAPP':
          if (notification.type === 'confirmation') {
            return await this.sendWhatsAppConfirmation(
              notification.data.to,
              notification.data.requestId,
              notification.data.command,
              notification.data.token,
              notification.data.expiresAt
            );
          } else if (notification.type === 'completion') {
            return await this.sendWhatsAppNotification(
              notification.data.to,
              notification.data.requestId,
              notification.data.command,
              notification.data.success,
              notification.data.output,
              notification.data.error
            );
          }
          break;

        default:
          throw new Error(`Unsupported notification channel: ${notification.channel}`);
      }

      return false;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }

  // Message parsing and processing
  async processIncomingMessage(message: IncomingMessage): Promise<{
    userId?: string;
    command?: string;
    attachments?: any[];
    shouldCreateRequest: boolean;
    error?: string;
  }> {
    try {
      // Parse the message to extract command and user info
      const parsed = await this.messageParser.parseMessage(message);

      // Get user ID from sender
      let userId: string | undefined;
      if (message.channel === 'EMAIL') {
        userId = await this.getUserFromInboxEmail(message.from) || undefined;
      } else if (message.channel === 'WHATSAPP') {
        userId = await this.whatsAppService.getUserFromWhatsAppNumber(message.from) || undefined;
      }

      // Process attachments if any
      let attachments: any[] = [];
      if (message.attachments && message.attachments.length > 0) {
        attachments = await this.attachmentHandler.processAttachments(message.attachments);
      }

      return {
        userId,
        command: parsed.command,
        attachments,
        shouldCreateRequest: Boolean(userId && parsed.command),
        error: !userId ? 'User not found' : (!parsed.command ? 'No command found in message' : undefined),
      };
    } catch (error) {
      console.error('Failed to process incoming message:', error);
      return {
        shouldCreateRequest: false,
        error: error instanceof Error ? error.message : 'Failed to process message',
      };
    }
  }

  // Status and health check
  async getStatus(): Promise<{
    email: { available: boolean; configured: boolean };
    whatsapp: { available: boolean; configured: boolean };
    services: { total: number; healthy: number };
  }> {
    try {
      const [emailReady, whatsappReady] = await Promise.all([
        this.emailService.testConnection(),
        this.whatsAppService.testConnection(),
      ]);

      const services = {
        total: 2,
        healthy: (emailReady ? 1 : 0) + (whatsappReady ? 1 : 0),
      };

      return {
        email: {
          available: emailReady,
          configured: Boolean(this.config.smtp || this.config.sendgrid),
        },
        whatsapp: {
          available: whatsappReady,
          configured: Boolean(this.config.whatsapp?.apiKey),
        },
        services,
      };
    } catch (error) {
      return {
        email: { available: false, configured: false },
        whatsapp: { available: false, configured: false },
        services: { total: 2, healthy: 0 },
      };
    }
  }

  // Event handling setup
  private setupEventHandlers(): void {
    // Forward email events
    this.emailService.on('email:sent', (data) => {
      this.emit('email:sent', data);
    });

    this.emailService.on('email:failed', (data) => {
      this.emit('email:failed', data);
    });

    // Forward WhatsApp events
    this.whatsAppService.on('whatsapp:sent', (data) => {
      this.emit('whatsapp:sent', data);
    });

    this.whatsAppService.on('whatsapp:failed', (data) => {
      this.emit('whatsapp:failed', data);
    });

    this.whatsAppService.on('whatsapp:received', (data) => {
      this.emit('message:received', { ...data, channel: 'WHATSAPP' });
    });

    // Log all communication events
    this.on('email:sent', (data) => {
      console.info(`📧 Email sent to ${data.to}: ${data.subject}`);
    });

    this.on('whatsapp:sent', (data) => {
      console.info(`📱 WhatsApp sent to ${data.to}`);
    });

    this.on('message:received', (data) => {
      console.info(`📨 Message received from ${data.from} via ${data.channel}`);
    });
  }

  // Advanced features
  async createBroadcast(
    recipients: Array<{ userId: string; channel: 'EMAIL' | 'WHATSAPP' }>,
    message: { subject?: string; content: string }
  ): Promise<{ sent: number; failed: number; results: any[] }> {
    const results = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        let result;
        if (recipient.channel === 'EMAIL') {
          // Get user email
          const user = await this.emailService.getUserFromInboxEmail(recipient.userId);
          if (user) {
            result = await this.sendEmail({
              to: recipient.userId,
              subject: message.subject || 'AI Dev Assistant Notification',
              text: message.content,
              html: message.content,
            });
            sent++;
          }
        } else if (recipient.channel === 'WHATSAPP') {
          result = await this.sendWhatsApp({
            to: recipient.userId,
            content: message.content,
          });
          sent++;
        }

        results.push({ recipient, success: true, result });
      } catch (error) {
        failed++;
        results.push({ recipient, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return { sent, failed, results };
  }
}