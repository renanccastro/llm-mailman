export const Constants = {
  // JWT
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',

  // Rate Limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 50,

  // Confirmation
  CONFIRMATION_TIMEOUT_SECONDS: 300, // 5 minutes

  // Container Defaults
  DEFAULT_MEMORY_LIMIT: 2048, // MB
  DEFAULT_CPU_LIMIT: 2.0,
  DEFAULT_DISK_LIMIT: 10240, // MB
  MAX_CONTAINER_LIFETIME: 3600, // 1 hour

  // File Upload
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: [
    'text/plain',
    'application/json',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
  ],

  // WebSocket
  WS_HEARTBEAT_INTERVAL: 30000, // 30 seconds
  WS_RECONNECT_DELAY: 5000, // 5 seconds

  // Protected Branches
  PROTECTED_BRANCHES: ['main', 'master', 'develop', 'staging', 'production'],

  // Regex Patterns
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  GITHUB_REPO_REGEX: /^[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/,

  // API Versions
  API_VERSION: 'v1',
  MIN_CLIENT_VERSION: '1.0.0',
} as const;

export const ErrorCodes = {
  // Authentication
  AUTH_INVALID_TOKEN: 'AUTH001',
  AUTH_TOKEN_EXPIRED: 'AUTH002',
  AUTH_UNAUTHORIZED: 'AUTH003',
  AUTH_FORBIDDEN: 'AUTH004',

  // Validation
  VALIDATION_ERROR: 'VAL001',
  INVALID_INPUT: 'VAL002',

  // Container
  CONTAINER_NOT_FOUND: 'CONT001',
  CONTAINER_START_FAILED: 'CONT002',
  CONTAINER_LIMIT_EXCEEDED: 'CONT003',

  // Request
  REQUEST_NOT_FOUND: 'REQ001',
  REQUEST_ALREADY_CONFIRMED: 'REQ002',
  REQUEST_CONFIRMATION_EXPIRED: 'REQ003',

  // Repository
  REPO_NOT_FOUND: 'REPO001',
  REPO_ACCESS_DENIED: 'REPO002',
  REPO_SYNC_FAILED: 'REPO003',

  // Rate Limit
  RATE_LIMIT_EXCEEDED: 'RATE001',

  // System
  INTERNAL_ERROR: 'SYS001',
  SERVICE_UNAVAILABLE: 'SYS002',
  DATABASE_ERROR: 'SYS003',
} as const;