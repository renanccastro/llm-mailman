export interface EmailMessage {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  encoding?: string;
  cid?: string;
  size?: number;
}

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video';
  content: {
    text?: string;
    mediaUrl?: string;
    mediaPath?: string;
    caption?: string;
    filename?: string;
  };
  replyTo?: string;
}

export interface IncomingMessage {
  id: string;
  from: string;
  to: string;
  channel: 'EMAIL' | 'WHATSAPP';
  content: string;
  attachments?: MessageAttachment[];
  timestamp: Date;
  metadata?: Record<string, any>;
  userId?: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  url?: string;
  localPath?: string;
  content?: Buffer;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'BOTH';
  subject?: string;
  template: string;
  variables: string[];
}

export interface ConfirmationMessage {
  requestId: string;
  userId: string;
  token: string;
  command: string;
  expiresAt: Date;
  channel: 'EMAIL' | 'WHATSAPP';
}

export interface MessageContext {
  userId: string;
  requestId?: string;
  conversationId?: string;
  isConfirmation?: boolean;
  metadata?: Record<string, any>;
}

export interface ParsedCommand {
  action: 'create_request' | 'confirm_request' | 'cancel_request' | 'status_check' | 'help';
  command?: string;
  repositoryName?: string;
  branch?: string;
  parameters?: Record<string, string>;
  attachments?: MessageAttachment[];
  confidence: number;
}

export interface EmailInboxConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  domain: string;
}

export interface WhatsAppConfig {
  apiToken?: string;
  phoneNumberId?: string;
  webhookToken?: string;
  businessApiUrl?: string;
  useWebVersion?: boolean;
}