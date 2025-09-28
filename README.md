# AI Development Assistant Platform

A secure, multi-modal platform that enables developers to interact with AI-powered development tools (starting with Claude Code) through email and WhatsApp, with enterprise-grade security and persistent containerized environments.

## 🚀 Features

- **Multi-Modal Access**: Send development requests via email or WhatsApp
- **Zero Cold Start**: Persistent Docker containers eliminate startup delays
- **Enterprise Security**: Multi-factor confirmation system prevents unauthorized access
- **Real-time Execution**: Live output streaming with WebSocket connections
- **GitHub Integration**: OAuth-based repository access with granular permissions
- **Container Management**: Kubernetes-based orchestration for scalable user environments
- **Privacy First**: Users provide their own API tokens, isolated environments

## 📋 Prerequisites

- Node.js 20+ and pnpm 8+
- Docker and Docker Compose
- PostgreSQL 16+
- Redis 7+
- GitHub OAuth App credentials
- WhatsApp Business API access (optional)
- Anthropic API key (user-provided)

## 🛠️ Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-org/ai-dev-assistant.git
cd ai-dev-assistant
pnpm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# Required: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET
nano .env
```

### 3. Database Setup

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run database migrations
pnpm db:generate
pnpm db:migrate

# (Optional) Open Prisma Studio to view database
pnpm db:studio
```

### 4. Start Development

```bash
# Start all services in development mode
pnpm dev

# Or start specific services
pnpm --filter @ai-dev/api-gateway dev
pnpm --filter @ai-dev/web-dashboard dev
```

### 5. Access Services

- API Gateway: http://localhost:4000
- Web Dashboard: http://localhost:3001
- API Docs: http://localhost:4000/api
- Health Check: http://localhost:4000/health
- WebSocket: ws://localhost:4000

## 📁 Project Structure

```
ai-dev-assistant/
├── apps/
│   ├── api-gateway/        # Main API server with Express
│   └── web-dashboard/       # Next.js frontend application
├── packages/
│   ├── shared/             # Shared types, utils, constants
│   ├── database/           # Prisma schemas and database client
│   ├── auth-service/       # Authentication and GitHub OAuth
│   ├── container-service/  # Docker/K8s container management
│   ├── communication-service/ # Email/WhatsApp handlers
│   └── ai-service/         # Claude Code integration
├── docker/
│   └── user-container/     # User container Dockerfile
├── monitoring/             # Prometheus and Grafana configs
├── scripts/               # Utility scripts
└── .github/workflows/     # CI/CD pipelines
```

## 🔧 Configuration

### GitHub OAuth Setup

1. Create a GitHub OAuth App:
   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Set Authorization callback URL: `http://localhost:4000/auth/github/callback`
   - Copy Client ID and Client Secret to `.env`

### WhatsApp Business API (Optional)

1. Register for WhatsApp Business API
2. Configure webhook URL: `https://your-domain.com/api/v1/webhooks/whatsapp`
3. Add credentials to `.env`

### Docker Services

```bash
# Start all services (including optional monitoring)
docker-compose --profile monitoring up -d

# Start only core services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @ai-dev/auth-service test

# Run tests with coverage
pnpm test:coverage
```

## 🚢 Production Deployment

### Using Docker

```bash
# Build production images
docker build -t aidev/api-gateway -f apps/api-gateway/Dockerfile .
docker build -t aidev/web-dashboard -f apps/web-dashboard/Dockerfile .

# Run with production compose
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Using Kubernetes

```bash
# Apply Kubernetes manifests
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/

# Check deployment status
kubectl get pods -n aidev-platform
```

### Environment Variables

Key production variables:
- `NODE_ENV=production`
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Strong random secret
- `ENCRYPTION_KEY` - 32-character key for token encryption

## 📊 Monitoring

### Prometheus Metrics
- Available at: http://localhost:9090
- Scrapes metrics from all services

### Grafana Dashboards
- Available at: http://localhost:3000
- Default login: admin/grafana_2025
- Pre-configured dashboards for system monitoring

## 🔒 Security

- All user API tokens are encrypted at rest
- Multi-factor authentication support (TOTP)
- IP whitelisting per user
- Rate limiting on all endpoints
- Request confirmation via email/WhatsApp
- Isolated container environments
- Protected branch restrictions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 API Documentation

### Authentication
```bash
# GitHub OAuth login
GET /api/v1/auth/github

# Refresh token
POST /api/v1/auth/refresh
Authorization: Bearer <refresh_token>
```

### Requests
```bash
# Create new request
POST /api/v1/requests
{
  "channel": "EMAIL",
  "message": "Fix the bug in auth service",
  "repositoryId": "repo_123"
}

# Confirm request
POST /api/v1/requests/:requestId/confirm
{
  "token": "confirmation_token",
  "confirmationType": "EMAIL"
}
```

### WebSocket Events
```javascript
// Connect
const socket = io('ws://localhost:4000', {
  auth: { token: 'your_jwt_token' }
});

// Subscribe to request updates
socket.emit('subscribe:request', requestId);

// Receive updates
socket.on('request:update', (message) => {
  console.log('Update:', message);
});
```

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL status
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Reset database
pnpm db:migrate:reset
```

### Container Issues
```bash
# Rebuild user container image
docker-compose build user-container-base

# Clear Docker cache
docker system prune -a
```

### Port Conflicts
```bash
# Check port usage
lsof -i :4000  # API
lsof -i :3001  # Web
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for Claude API
- [GitHub](https://github.com) for OAuth and API
- [WhatsApp Business](https://business.whatsapp.com) for messaging API
- Open source community for amazing tools and libraries

## 📞 Support

- Documentation: [https://docs.aidev.platform](https://docs.aidev.platform)
- Issues: [GitHub Issues](https://github.com/your-org/ai-dev-assistant/issues)
- Discord: [Join our community](https://discord.gg/aidev)
- Email: support@aidev.platform

---

Built with ❤️ by the AI Dev Assistant Team