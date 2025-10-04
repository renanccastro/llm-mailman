export interface AIProvider {
  name: string;
  execute(request: AIRequest): Promise<AIResponse>;
  streamExecute?(request: AIRequest): AsyncGenerator<AIStreamChunk>;
  isAvailable(): Promise<boolean>;
}

export interface AIRequest {
  id: string;
  userId: string;
  command: string;
  context?: AIContext;
  options?: AIRequestOptions;
  attachments?: Array<{
    filename: string;
    content: string;
    mimetype: string;
  }>;
}

export interface AIResponse {
  id: string;
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost?: number;
  };
  executedCommands?: ExecutedCommand[];
}

export interface AIStreamChunk {
  type: 'output' | 'command' | 'error' | 'complete';
  content: string;
  metadata?: Record<string, any>;
}

export interface AIContext {
  repositoryPath?: string;
  repositoryName?: string;
  branch?: string;
  workingDirectory?: string;
  environment?: Record<string, string>;
  previousCommands?: string[];
  fileContents?: Array<{
    path: string;
    content: string;
  }>;
  projectStructure?: ProjectStructure;
}

export interface ProjectStructure {
  root: string;
  files: FileNode[];
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  language?: string;
  framework?: string;
  hasTests?: boolean;
  hasCi?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

export interface AIRequestOptions {
  provider?: 'claude' | 'openai' | 'claude-code' | 'auto';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  yoloMode?: boolean;
  dryRun?: boolean;
  timeout?: number;
}

export interface ExecutedCommand {
  command: string;
  workingDirectory: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timestamp: Date;
}

export interface ClaudeCodeSession {
  sessionId: string;
  userId: string;
  containerId: string;
  workspaceRoot: string;
  isActive: boolean;
  lastActivity: Date;
  context: AIContext;
}

export interface CommandAnalysis {
  type: 'safe' | 'potentially_dangerous' | 'dangerous';
  commands: string[];
  risks: string[];
  filesAffected: string[];
  networkAccess: boolean;
  systemAccess: boolean;
  dataAccess: boolean;
  confidence: number;
}

export interface AIServiceConfig {
  claudeApiKey?: string;
  openaiApiKey?: string;
  defaultProvider: 'claude' | 'openai' | 'claude-code' | 'auto';
  maxConcurrentRequests: number;
  requestTimeout: number;
  enableStreaming: boolean;
  yoloModeDefault: boolean;
  maxTokensDefault: number;
  temperatureDefault: number;
}

export interface ExecOptions {
  command?: string | string[];
  containerId?: string;
  workDir?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string | boolean;
  encoding?: BufferEncoding;
  maxBuffer?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  output?: string; // Combined stdout/stderr or raw output
  exitCode: number;
  signal?: string;
}