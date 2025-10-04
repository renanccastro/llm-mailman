export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
  githubId: string;
  role: 'USER' | 'ADMIN';
}

export interface SessionData {
  id: string;
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: 'USER' | 'ADMIN';
}

export interface ContainerConfig {
  memoryLimit?: number;
  cpuLimit?: number;
  diskLimit?: number;
  environment?: Record<string, string>;
  volumes?: Array<{
    source: string;
    target: string;
    readonly?: boolean;
  }>;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  duration?: number;
}

export interface WebSocketMessage {
  type: 'output' | 'status' | 'error' | 'complete' | 'heartbeat';
  requestId?: string;
  data: unknown;
  timestamp: string;
}

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template' | 'media';
  content: {
    text?: string;
    templateName?: string;
    templateParams?: Record<string, string>;
    mediaUrl?: string;
    mediaType?: 'image' | 'document' | 'audio';
  };
}