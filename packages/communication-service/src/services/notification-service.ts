import { EventEmitter } from 'events';
import { EmailService } from './email-service';
import { WhatsAppService } from './whatsapp-service';
import { prisma, NotificationChannel } from '@ai-dev/database';
import { ConfirmationMessage } from '../types';

export class NotificationService extends EventEmitter {
  private emailService: EmailService;
  private whatsappService: WhatsAppService;

  constructor() {
    super();
    this.emailService = new EmailService();
    this.whatsappService = new WhatsAppService();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize WhatsApp service
      await this.whatsappService.initialize();

      // Set up event handlers
      this.setupEventHandlers();

      console.info('✅ Notification service initialized');
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
      // Continue without WhatsApp if it fails
    }
  }

  async sendConfirmationRequest(confirmation: ConfirmationMessage): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: confirmation.userId },
    });

    if (!user) {
      throw new Error(`User ${confirmation.userId} not found`);
    }

    const promises: Promise<boolean>[] = [];
    const channel = confirmation.channel as string;

    // Send email confirmation
    if (channel === 'EMAIL' || channel === 'MULTI_FACTOR') {
      if (user.privateEmail) {
        promises.push(
          this.emailService.sendConfirmationEmail(
            user.privateEmail,
            confirmation.requestId,
            confirmation.command,
            confirmation.token,
            confirmation.expiresAt
          )
        );
      }
    }

    // Send WhatsApp confirmation
    if (channel === 'WHATSAPP' || channel === 'MULTI_FACTOR') {
      if (user.whatsappNumber && await this.whatsappService.isReady()) {
        promises.push(
          this.whatsappService.sendConfirmationMessage(
            user.whatsappNumber,
            confirmation.requestId,
            confirmation.command,
            confirmation.token,
            confirmation.expiresAt
          )
        );
      }
    }

    // Wait for all notifications to be sent
    const results = await Promise.allSettled(promises);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const channel = index === 0 ? 'email' : 'whatsapp';
        console.error(`Failed to send ${channel} confirmation:`, result.reason);
      }
    });

    // Store notification record
    await this.logNotification(
      confirmation.userId,
      confirmation.requestId,
      'confirmation_required',
      confirmation.channel,
      `Confirmation request for: ${confirmation.command}`,
      results.some(r => r.status === 'fulfilled')
    );
  }

  async sendExecutionNotification(
    userId: string,
    requestId: string,
    command: string,
    success: boolean,
    output?: string,
    error?: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const promises: Promise<boolean>[] = [];

    // Send email notification
    if (user.notificationChannel === 'EMAIL' || user.notificationChannel === 'BOTH') {
      if (user.privateEmail) {
        promises.push(
          this.emailService.sendExecutionNotification(
            user.privateEmail,
            requestId,
            command,
            success,
            output,
            error
          )
        );
      }
    }

    // Send WhatsApp notification
    if (user.notificationChannel === 'WHATSAPP' || user.notificationChannel === 'BOTH') {
      if (user.whatsappNumber && await this.whatsappService.isReady()) {
        promises.push(
          this.whatsappService.sendExecutionNotification(
            user.whatsappNumber,
            requestId,
            command,
            success,
            output,
            error
          )
        );
      }
    }

    // Wait for all notifications
    const results = await Promise.allSettled(promises);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const channel = index === 0 ? 'email' : 'whatsapp';
        console.error(`Failed to send ${channel} execution notification:`, result.reason);
      }
    });

    // Store notification record
    await this.logNotification(
      userId,
      requestId,
      success ? 'execution_completed' : 'execution_failed',
      user.notificationChannel,
      `Command ${success ? 'completed' : 'failed'}: ${command}`,
      results.some(r => r.status === 'fulfilled')
    );
  }

  async sendWelcomeMessage(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const welcomeMessage = `Welcome to AI Dev Assistant! 🎉

Your account has been successfully set up:

📧 Private Email: ${user.privateEmail || 'Not assigned'}
📱 WhatsApp: ${user.whatsappNumber || 'Not assigned'}

You can now send development requests via email or WhatsApp. I'll help you with:
• Running tests and builds
• Deploying code
• Fixing bugs
• Managing repositories
• And much more!

Send "help" anytime to see available commands.

Happy coding! 🚀`;

    const promises: Promise<boolean>[] = [];

    // Send welcome email
    if (user.privateEmail) {
      promises.push(
        this.emailService.sendEmail({
          to: user.privateEmail,
          subject: '🎉 Welcome to AI Dev Assistant!',
          html: this.formatWelcomeHTML(welcomeMessage, user),
          text: welcomeMessage,
        })
      );
    }

    // Send welcome WhatsApp message
    if (user.whatsappNumber && await this.whatsappService.isReady()) {
      promises.push(
        this.whatsappService.sendMessage({
          to: user.whatsappNumber,
          type: 'text',
          content: { text: welcomeMessage },
        })
      );
    }

    await Promise.allSettled(promises);
  }

  async sendSystemAlert(
    userId: string,
    type: 'container_stopped' | 'container_error' | 'resource_limit' | 'security_alert',
    message: string,
    details?: Record<string, any>
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.notificationChannel === 'EMAIL') {
      return; // Only send system alerts via WhatsApp for immediate attention
    }

    if (user.whatsappNumber && await this.whatsappService.isReady()) {
      const alertMessage = `🚨 *System Alert*

${message}

Type: ${type}
Time: ${new Date().toLocaleString()}

${details ? `Details: ${JSON.stringify(details, null, 2)}` : ''}

Please check your dashboard for more information.`;

      await this.whatsappService.sendMessage({
        to: user.whatsappNumber,
        type: 'text',
        content: { text: alertMessage },
      });
    }
  }

  async getWhatsAppQRCode(): Promise<string | null> {
    return await this.whatsappService.getQRCode();
  }

  async assignCommunicationChannels(userId: string): Promise<{
    email: string;
    whatsapp?: string;
  }> {
    const result: { email: string; whatsapp?: string } = {
      email: await this.emailService.generateUserInbox(userId),
    };

    try {
      result.whatsapp = await this.whatsappService.assignPhoneNumber(userId);
    } catch (error) {
      console.error('Failed to assign WhatsApp number:', error);
    }

    return result;
  }

  async testServices(): Promise<{
    email: boolean;
    whatsapp: boolean;
  }> {
    const [emailWorking, whatsappWorking] = await Promise.all([
      this.emailService.testConnection(),
      this.whatsappService.testConnection(),
    ]);

    return {
      email: emailWorking,
      whatsapp: whatsappWorking,
    };
  }

  private setupEventHandlers(): void {
    // Email service events
    this.emailService.on('email:sent', (data) => {
      this.emit('notification:sent', { channel: 'email', ...data });
    });

    this.emailService.on('email:failed', (data) => {
      this.emit('notification:failed', { channel: 'email', ...data });
    });

    // WhatsApp service events
    this.whatsappService.on('message:sent', (data) => {
      this.emit('notification:sent', { channel: 'whatsapp', ...data });
    });

    this.whatsappService.on('message:failed', (data) => {
      this.emit('notification:failed', { channel: 'whatsapp', ...data });
    });

    this.whatsappService.on('message:received', (message) => {
      this.emit('message:received', message);
    });

    this.whatsappService.on('qr', (qr) => {
      this.emit('whatsapp:qr', qr);
    });

    this.whatsappService.on('ready', () => {
      this.emit('whatsapp:ready');
    });
  }

  private async logNotification(
    userId: string,
    requestId: string,
    type: string,
    channel: NotificationChannel,
    content: string,
    sent: boolean
  ): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId,
          requestId,
          channel,
          type,
          content,
          sent,
          sentAt: sent ? new Date() : undefined,
          delivered: sent, // Assume delivered if sent successfully
          deliveredAt: sent ? new Date() : undefined,
        },
      });
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  private formatWelcomeHTML(_message: string, user: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to AI Dev Assistant</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .info-box { background: #EFF6FF; border: 1px solid #3B82F6; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to AI Dev Assistant!</h1>
        </div>
        <div class="content">
            <p>Hi ${user.name || user.githubUsername}!</p>

            <p>Your account has been successfully set up and you're ready to start using AI-powered development assistance!</p>

            <div class="info-box">
                <h3>📧 Your Private Email</h3>
                <p><strong>${user.privateEmail}</strong></p>
                <p>Send development requests to this email address.</p>
            </div>

            ${user.whatsappNumber ? `
            <div class="info-box">
                <h3>📱 Your WhatsApp Number</h3>
                <p><strong>${user.whatsappNumber}</strong></p>
                <p>Send messages to this number for instant assistance.</p>
            </div>
            ` : ''}

            <h3>🚀 What can I help you with?</h3>
            <ul>
                <li>Running tests and builds</li>
                <li>Deploying code to different environments</li>
                <li>Fixing bugs and debugging</li>
                <li>Managing repositories and branches</li>
                <li>Installing dependencies</li>
                <li>And much more!</li>
            </ul>

            <p><strong>Getting Started:</strong> Simply send me a message describing what you'd like to do. I'll confirm before executing any commands to keep your code safe.</p>

            <p>Send "help" anytime to see available commands and examples.</p>
        </div>
        <div class="footer">
            <p>AI Dev Assistant Platform | Secure Development Automation</p>
            <p>Visit our dashboard: <a href="${process.env.WEB_APP_URL}">${process.env.WEB_APP_URL}</a></p>
        </div>
    </div>
</body>
</html>`;
  }
}