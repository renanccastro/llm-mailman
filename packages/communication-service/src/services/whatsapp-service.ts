import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { EventEmitter } from 'events';
import { WhatsAppMessage, WhatsAppConfig, IncomingMessage } from '../types';
import { ServiceUnavailableError } from '@ai-dev/shared';
import { prisma } from '@ai-dev/database';

export class WhatsAppService extends EventEmitter {
  private client?: Client;
  private _isReady: boolean = false;
  private config: WhatsAppConfig;
  private userPhoneNumbers: Map<string, string> = new Map();

  constructor(config: WhatsAppConfig = {}) {
    super();
    this.config = config;
    this.setupClient();
  }

  private setupClient(): void {
    if (this.config.useWebVersion !== false) {
      // Use WhatsApp Web version
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: './whatsapp-sessions',
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
          ],
        },
      });

      this.setupEventHandlers();
    } else {
      console.info('WhatsApp Business API mode (not implemented in this demo)');
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('qr', (qr) => {
      console.info('WhatsApp QR Code generated. Scan with your phone:');
      qrcode.generate(qr, { small: true });
      this.emit('qr', qr);
    });

    this.client.on('ready', () => {
      console.info('✅ WhatsApp client is ready!');
      this._isReady = true;
      this.emit('ready');
    });

    this.client.on('authenticated', () => {
      console.info('WhatsApp client authenticated');
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('WhatsApp authentication failed:', msg);
      this.emit('auth_failure', msg);
    });

    this.client.on('disconnected', (reason) => {
      console.info('WhatsApp client disconnected:', reason);
      this._isReady = false;
      this.emit('disconnected', reason);
    });

    this.client.on('message', async (message) => {
      try {
        const incomingMessage = await this.parseIncomingMessage(message);
        if (incomingMessage) {
          this.emit('message:received', incomingMessage);
        }
      } catch (error) {
        console.error('Error processing incoming WhatsApp message:', error);
      }
    });

    this.client.on('message_create', async (message) => {
      // Handle sent messages for tracking
      if (message.fromMe) {
        this.emit('message:sent', {
          to: message.to,
          content: message.body,
          timestamp: new Date(message.timestamp * 1000),
        });
      }
    });
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      throw new ServiceUnavailableError('WhatsApp', 'Client not configured');
    }

    try {
      await this.client.initialize();
      console.info('WhatsApp client initialized');
    } catch (error) {
      console.error('Failed to initialize WhatsApp client:', error);
      throw new ServiceUnavailableError('WhatsApp', { originalError: error });
    }
  }

  async sendMessage(message: WhatsAppMessage): Promise<boolean> {
    if (!this._isReady || !this.client) {
      throw new ServiceUnavailableError('WhatsApp', 'Client not ready');
    }

    try {
      const chatId = this.formatPhoneNumber(message.to);

      switch (message.type) {
        case 'text':
          await this.client.sendMessage(chatId, message.content.text || '');
          break;

        case 'image':
        case 'document':
        case 'audio':
        case 'video':
          await this.sendMediaMessage(chatId, message);
          break;

        default:
          throw new Error(`Unsupported message type: ${message.type}`);
      }

      this.emit('message:sent', { to: message.to, type: message.type });
      return true;
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      this.emit('message:failed', { to: message.to, error });
      throw new ServiceUnavailableError('WhatsApp', { originalError: error });
    }
  }

  private async sendMediaMessage(chatId: string, message: WhatsAppMessage): Promise<void> {
    if (!this.client) return;

    let media: MessageMedia;

    if (message.content.mediaPath) {
      media = MessageMedia.fromFilePath(message.content.mediaPath);
    } else if (message.content.mediaUrl) {
      media = await MessageMedia.fromUrl(message.content.mediaUrl);
    } else {
      throw new Error('No media source provided');
    }

    if (message.content.filename) {
      media.filename = message.content.filename;
    }

    await this.client.sendMessage(chatId, media, {
      caption: message.content.caption,
    });
  }

  async sendConfirmationMessage(
    to: string,
    requestId: string,
    command: string,
    token: string,
    expiresAt: Date
  ): Promise<boolean> {
    const expiresInMinutes = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60));
    const confirmUrl = `${process.env.WEB_APP_URL}/confirm?token=${token}&requestId=${requestId}`;

    const message = `🤖 *AI Dev Assistant* - Confirm Command

You've submitted a development request:

\`\`\`
${command}
\`\`\`

⚠️ *Please confirm this command before execution.*

🔗 Confirm here: ${confirmUrl}

⏰ Expires in ${expiresInMinutes} minutes.

_If you didn't submit this request, please ignore this message._`;

    return this.sendMessage({
      to,
      type: 'text',
      content: { text: message },
    });
  }

  async sendExecutionNotification(
    to: string,
    requestId: string,
    command: string,
    success: boolean,
    output?: string,
    error?: string
  ): Promise<boolean> {
    const emoji = success ? '✅' : '❌';
    const status = success ? 'completed successfully' : 'failed';

    let message = `${emoji} *AI Dev Assistant* - Command ${success ? 'Completed' : 'Failed'}

Your request has ${status}:

\`\`\`
${command}
\`\`\`

Request ID: \`${requestId}\``;

    if (output && output.length > 0) {
      const truncatedOutput = output.length > 500 ? output.substring(0, 500) + '...' : output;
      message += `\n\n📤 *Output:*\n\`\`\`\n${truncatedOutput}\n\`\`\``;
    }

    if (error && error.length > 0) {
      const truncatedError = error.length > 300 ? error.substring(0, 300) + '...' : error;
      message += `\n\n⚠️ *Error:*\n\`\`\`\n${truncatedError}\n\`\`\``;
    }

    if (success) {
      message += '\n\n✨ Your changes have been saved to your workspace.';
    } else {
      message += '\n\n🔄 Please review the error and try again.';
    }

    return this.sendMessage({
      to,
      type: 'text',
      content: { text: message },
    });
  }

  async assignPhoneNumber(userId: string): Promise<string> {
    // In a real implementation, this would assign a dedicated WhatsApp Business number
    // For demo purposes, we'll use a virtual number format
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Generate a virtual number based on user ID
    const virtualNumber = `+1555${userId.slice(-7).padStart(7, '0')}`;

    // Update user with WhatsApp number
    await prisma.user.update({
      where: { id: userId },
      data: { whatsappNumber: virtualNumber },
    });

    this.userPhoneNumbers.set(virtualNumber, userId);
    return virtualNumber;
  }

  async getUserFromPhoneNumber(phoneNumber: string): Promise<string | null> {
    const formattedNumber = this.formatPhoneNumber(phoneNumber);

    // Check local cache first
    const cachedUserId = this.userPhoneNumbers.get(formattedNumber);
    if (cachedUserId) {
      return cachedUserId;
    }

    // Check database
    const user = await prisma.user.findUnique({
      where: { whatsappNumber: formattedNumber },
    });

    if (user) {
      this.userPhoneNumbers.set(formattedNumber, user.id);
      return user.id;
    }

    return null;
  }

  async getUserFromWhatsAppNumber(phoneNumber: string): Promise<string | null> {
    return this.getUserFromPhoneNumber(phoneNumber);
  }

  private async parseIncomingMessage(message: Message): Promise<IncomingMessage | null> {
    // Skip messages from groups or broadcasts
    const chat = await message.getChat();
    if (chat.isGroup) {
      return null;
    }

    // Get user ID from phone number
    const userId = await this.getUserFromPhoneNumber(message.from);

    // Parse attachments if any
    const attachments = [];
    if (message.hasMedia) {
      try {
        const media = await message.downloadMedia();
        attachments.push({
          id: `wa_${message.id.id}`,
          filename: media.filename || 'attachment',
          mimetype: media.mimetype,
          size: Buffer.from(media.data, 'base64').length,
          content: Buffer.from(media.data, 'base64'),
        });
      } catch (error) {
        console.error('Failed to download WhatsApp media:', error);
      }
    }

    return {
      id: message.id.id,
      from: message.from,
      to: message.to || '',
      channel: 'WHATSAPP',
      content: message.body,
      attachments,
      timestamp: new Date(message.timestamp * 1000),
      userId: userId || undefined,
      metadata: {
        messageType: message.type,
        hasQuotedMsg: message.hasQuotedMsg,
        quotedMsg: message.hasQuotedMsg ? await message.getQuotedMessage() : undefined,
      },
    };
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if missing
    if (cleaned.length === 10 && !cleaned.startsWith('1')) {
      return `1${cleaned}`;
    }

    return cleaned;
  }

  async isReady(): Promise<boolean> {
    return this._isReady;
  }

  async getQRCode(): Promise<string | null> {
    return new Promise((resolve) => {
      if (this._isReady) {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(null);
      }, 30000); // 30 second timeout

      this.once('qr', (qr) => {
        clearTimeout(timeout);
        resolve(qr);
      });

      this.once('ready', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this._isReady = false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      return this._isReady && this.client !== undefined;
    } catch (error) {
      console.error('WhatsApp service connection test failed:', error);
      return false;
    }
  }
}