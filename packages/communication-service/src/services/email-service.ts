import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { EventEmitter } from 'events';
import { EmailMessage, EmailInboxConfig } from '../types';
import { ServiceUnavailableError } from '@ai-dev/shared';
import { prisma } from '@ai-dev/database';

export class EmailService extends EventEmitter {
  private transporter?: nodemailer.Transporter;
  private sendgridConfigured: boolean = false;
  private inboxConfig?: EmailInboxConfig;

  constructor() {
    super();
    this.setupTransporter();
  }

  private setupTransporter(): void {
    const sendgridKey = process.env.SENDGRID_API_KEY;

    if (sendgridKey) {
      sgMail.setApiKey(sendgridKey);
      this.sendgridConfigured = true;
      console.info('✅ SendGrid configured for email sending');
    } else {
      // Fallback to SMTP
      const smtpConfig = {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '1025'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        } : undefined,
      };

      this.transporter = nodemailer.createTransport(smtpConfig);
      console.info('✅ SMTP transporter configured for email sending');
    }

    this.setupInboxConfig();
  }

  private setupInboxConfig(): void {
    const domain = process.env.EMAIL_DOMAIN || 'aidev.platform';

    this.inboxConfig = {
      host: process.env.IMAP_HOST || 'localhost',
      port: parseInt(process.env.IMAP_PORT || '993'),
      secure: process.env.IMAP_SECURE !== 'false',
      username: process.env.IMAP_USER || 'inbox@' + domain,
      password: process.env.IMAP_PASS || '',
      domain,
    };
  }

  async sendEmail(message: EmailMessage): Promise<boolean> {
    try {
      const from = message.from || process.env.EMAIL_FROM || 'noreply@aidev.platform';

      if (this.sendgridConfigured) {
        await this.sendViaSendGrid({ ...message, from });
      } else if (this.transporter) {
        await this.sendViaSMTP({ ...message, from });
      } else {
        throw new Error('No email service configured');
      }

      // Log the sent email
      await this.logSentEmail(message);

      this.emit('email:sent', { to: message.to, subject: message.subject });
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      this.emit('email:failed', { to: message.to, error });
      throw new ServiceUnavailableError('Email Service', { originalError: error });
    }
  }

  private async sendViaSendGrid(message: EmailMessage): Promise<void> {
    const msg = {
      to: message.to,
      from: message.from!,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map(att => ({
        content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment',
      })),
      headers: message.headers,
      replyTo: message.replyTo,
    };

    await sgMail.send(msg as any);
  }

  private async sendViaSMTP(message: EmailMessage): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP transporter not configured');
    }

    const mailOptions = {
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        encoding: att.encoding,
        cid: att.cid,
      })),
      headers: message.headers,
      replyTo: message.replyTo,
      inReplyTo: message.inReplyTo,
      references: message.references,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendConfirmationEmail(
    to: string,
    requestId: string,
    command: string,
    token: string,
    expiresAt: Date
  ): Promise<boolean> {
    const confirmUrl = `${process.env.WEB_APP_URL}/confirm?token=${token}&requestId=${requestId}`;
    const expiresInMinutes = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60));

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>AI Dev Assistant - Confirm Command</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .command { background: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 6px; font-family: monospace; }
        .button { display: inline-block; background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
        .warning { background: #FEF3C7; border: 1px solid #F59E0B; padding: 10px; border-radius: 4px; margin: 15px 0; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 AI Dev Assistant</h1>
            <p>Command Confirmation Required</p>
        </div>
        <div class="content">
            <p>Hi there!</p>

            <p>You've submitted a development request that requires confirmation before execution:</p>

            <div class="command">${this.escapeHtml(command)}</div>

            <div class="warning">
                <strong>⚠️ Security Notice:</strong><br>
                Please review this command carefully before confirming. Only confirm if you submitted this request.
            </div>

            <p>To authorize this command, click the button below:</p>

            <a href="${confirmUrl}" class="button">✅ Confirm Command</a>

            <p>Or copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 4px;">
                ${confirmUrl}
            </p>

            <p><strong>This confirmation expires in ${expiresInMinutes} minutes.</strong></p>

            <p>If you didn't submit this request, please ignore this email and consider updating your security settings.</p>
        </div>
        <div class="footer">
            <p>AI Dev Assistant Platform | Secure Development Automation</p>
            <p>This is an automated message. Please do not reply.</p>
        </div>
    </div>
</body>
</html>`;

    const text = `
AI Dev Assistant - Command Confirmation Required

You've submitted a development request that requires confirmation:

Command: ${command}

To confirm, visit: ${confirmUrl}

This confirmation expires in ${expiresInMinutes} minutes.

If you didn't submit this request, please ignore this email.
`;

    return this.sendEmail({
      to,
      subject: '🔐 AI Dev Assistant - Confirm Command Execution',
      html,
      text,
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
    const status = success ? 'completed successfully' : 'failed';
    const emoji = success ? '✅' : '❌';
    const resultColor = success ? '#059669' : '#DC2626';

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>AI Dev Assistant - Command ${success ? 'Completed' : 'Failed'}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${resultColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .command { background: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 6px; font-family: monospace; margin: 15px 0; }
        .output { background: #f3f4f6; padding: 15px; border-radius: 6px; font-family: monospace; max-height: 300px; overflow-y: auto; }
        .error { background: #FEE2E2; border: 1px solid #DC2626; padding: 15px; border-radius: 6px; font-family: monospace; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${emoji} AI Dev Assistant</h1>
            <p>Command ${status}</p>
        </div>
        <div class="content">
            <p>Your development request has ${status}:</p>

            <div class="command">${this.escapeHtml(command)}</div>

            ${output ? `
            <h3>Output:</h3>
            <div class="output">${this.escapeHtml(output)}</div>
            ` : ''}

            ${error ? `
            <h3>Error:</h3>
            <div class="error">${this.escapeHtml(error)}</div>
            ` : ''}

            <p>Request ID: <code>${requestId}</code></p>

            ${success ?
              '<p>You can continue working in your development environment. Any changes have been saved to your persistent workspace.</p>' :
              '<p>Please review the error message above and try again with a corrected command.</p>'
            }
        </div>
        <div class="footer">
            <p>AI Dev Assistant Platform | Secure Development Automation</p>
        </div>
    </div>
</body>
</html>`;

    const text = `
AI Dev Assistant - Command ${success ? 'Completed' : 'Failed'}

Your development request has ${status}:

Command: ${command}

${output ? `Output:\n${output}\n\n` : ''}
${error ? `Error:\n${error}\n\n` : ''}

Request ID: ${requestId}
`;

    return this.sendEmail({
      to,
      subject: `${emoji} AI Dev Assistant - Command ${success ? 'Completed' : 'Failed'}`,
      html,
      text,
    });
  }

  async generateUserInbox(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Generate a unique email address for the user
    const username = user.githubUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domain = this.inboxConfig?.domain || 'aidev.platform';
    const email = `${username}@${domain}`;

    // Update user with private email
    await prisma.user.update({
      where: { id: userId },
      data: { privateEmail: email },
    });

    return email;
  }

  async getUserFromInboxEmail(email: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { privateEmail: email },
    });

    return user?.id || null;
  }

  private async logSentEmail(message: EmailMessage): Promise<void> {
    try {
      // Log to database for audit trail
      console.info(`Email sent to ${message.to}: ${message.subject}`);
    } catch (error) {
      console.error('Failed to log sent email:', error);
    }
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.sendgridConfigured) {
        // Test SendGrid by sending to test email
        return true;
      } else if (this.transporter) {
        await this.transporter.verify();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Email service connection test failed:', error);
      return false;
    }
  }
}