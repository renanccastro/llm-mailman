# Complete Setup Guide - AI Development Assistant Platform

This guide walks you through setting up the entire AI Development Assistant Platform with GitHub OAuth and push notifications.

## 🚀 Quick Start (Development)

### 1. Prerequisites
```bash
# Install required software
node -v  # Should be 18+
pnpm -v  # Should be 8+
docker -v
docker-compose -v

# Install pnpm if needed
npm install -g pnpm
```

### 2. Clone and Install
```bash
# Clone the repository
git clone <your-repo-url>
cd maillm

# Install all dependencies
pnpm install

# Build shared packages
pnpm run build:packages
```

### 3. Database Setup
```bash
# Start PostgreSQL and Redis with Docker
docker-compose up -d postgres redis

# Setup database schema
cd packages/database
pnpm run db:push
pnpm run db:seed  # Optional: add sample data
```

### 4. GitHub OAuth Setup

#### Create GitHub OAuth App
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: AI Development Assistant
   - **Homepage URL**: `http://localhost:3001`
   - **Authorization callback URL**: `http://localhost:3001/auth/callback`
4. Save **Client ID** and generate **Client Secret**

### 5. Generate Push Notification Keys
```bash
# Install web-push CLI globally
npm install -g web-push

# Generate VAPID keys for push notifications
web-push generate-vapid-keys

# Save the output - you'll need both keys
```

### 6. Environment Configuration

#### API Gateway (.env)
```bash
# Copy template
cp apps/api-gateway/.env.example apps/api-gateway/.env

# Edit with your values
nano apps/api-gateway/.env
```

Add your actual values:
```bash
# Server
NODE_ENV=development
PORT=4000

# Database
DATABASE_URL="postgresql://ai_dev_user:secure_password_123@localhost:5432/ai_dev_assistant"

# Redis
REDIS_URL="redis://localhost:6379"

# GitHub OAuth (from step 4)
GITHUB_CLIENT_ID=your-actual-github-client-id
GITHUB_CLIENT_SECRET=your-actual-github-client-secret

# JWT (generate a secure 32+ character string)
JWT_SECRET=your-super-secure-jwt-secret-at-least-32-characters-long

# Push Notifications (from step 5)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Email (choose one option)
# Option 1: SendGrid
SENDGRID_API_KEY=your-sendgrid-api-key

# Option 2: Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
```

#### Web Dashboard (.env.local)
```bash
# Copy template
cp apps/web-dashboard/.env.example apps/web-dashboard/.env.local

# Edit with your values
nano apps/web-dashboard/.env.local
```

Add your values:
```bash
# GitHub OAuth (same client ID as API Gateway)
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-actual-github-client-id

# API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

### 7. Start Development Servers

#### Option A: Start All Services
```bash
# Start everything in development mode
pnpm run dev
```

#### Option B: Start Services Individually
```bash
# Terminal 1: API Gateway
cd apps/api-gateway
pnpm run dev

# Terminal 2: Web Dashboard
cd apps/web-dashboard
pnpm run dev

# Terminal 3: Check database
cd packages/database
pnpm run studio  # Opens Prisma Studio
```

### 8. Test the Setup

1. **Visit Dashboard**: http://localhost:3001
2. **Sign in with GitHub**: Click the GitHub login button
3. **Grant repository permissions**: Allow access to your repositories
4. **Enable Push Notifications**: Click "Enable" in the security section
5. **Send Test Email**: Send an email to `yourgithubusername@aidev.platform`

#### Test Email Format
```
To: yourgithubusername@aidev.platform
Subject: [your-repo-name] Test command
Body: Create a simple "Hello World" function in Python
```

## 🔧 Configuration Details

### Email Provider Setup

#### Option 1: SendGrid (Recommended)
1. Create SendGrid account at sendgrid.com
2. Create API key with "Mail Send" permissions
3. Add `SENDGRID_API_KEY` to your .env file

#### Option 2: Gmail SMTP
1. Enable 2-Factor Authentication on Gmail
2. Generate App Password:
   - Google Account → Security → App passwords
   - Select "Mail" and your device
   - Use the generated 16-character password
3. Add SMTP settings to .env file

### Container Runtime Setup

The platform requires Docker for creating isolated development environments:

```bash
# Ensure Docker is running
docker info

# Pull base images
docker pull ubuntu:22.04
docker pull node:18-alpine

# Build custom development image (optional - will be built automatically)
cd apps/api-gateway
docker build -f Dockerfile.dev -t ai-dev-base .
```

### Database Migration

If you make changes to the Prisma schema:

```bash
cd packages/database

# Generate migration
pnpm run db:migrate

# Push changes to database
pnpm run db:push

# Reset database (if needed)
pnpm run db:reset
```

## 🐳 Docker Deployment

### Development with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Docker Setup

1. **Build production images**:
```bash
# Build API Gateway
docker build -t your-registry/ai-dev-assistant/api-gateway:latest ./apps/api-gateway

# Build Web Dashboard
docker build -t your-registry/ai-dev-assistant/web-dashboard:latest ./apps/web-dashboard
```

2. **Use production docker-compose.yml** (see DEPLOYMENT_GUIDE.md)

## 🔒 Security Configuration

### JWT Secret Generation
```bash
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### GitHub OAuth Security
- Use different OAuth apps for development and production
- Restrict callback URLs to your actual domains
- Regularly rotate client secrets

### Container Security
```bash
# Run containers with limited privileges
docker run --user 1000:1000 --read-only --tmpfs /tmp ai-dev-base

# Use security profiles
docker run --security-opt apparmor:ai-dev-profile ai-dev-base
```

## 📧 Email Configuration

### Incoming Email Setup

For production, you'll need to configure email receiving:

1. **Set up email forwarding** to your webhook endpoint
2. **Configure DNS MX records** for your domain
3. **Set up email webhook** in your email provider

Example webhook configuration:
```bash
# Webhook URL
https://yourapi.domain.com/api/v1/email/incoming

# Headers
Content-Type: application/json
Authorization: Bearer your-webhook-secret
```

### Email Templates

Customize email templates in:
- `apps/api-gateway/src/templates/` (create this directory)
- Templates for confirmation, completion, and error emails

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
pnpm test

# Run tests for specific package
cd apps/api-gateway
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### Integration Tests
```bash
# Start test databases
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
pnpm test:integration
```

### Manual Testing Checklist

- [ ] GitHub OAuth login works
- [ ] Repository list displays correctly
- [ ] Push notifications are received
- [ ] Email confirmation fallback works
- [ ] Commands execute in containers
- [ ] Results are sent via email
- [ ] Container cleanup happens
- [ ] Error handling works correctly

## 🚨 Troubleshooting

### Common Issues

1. **OAuth redirect mismatch**
   ```
   Error: redirect_uri_mismatch
   Solution: Check callback URL in GitHub OAuth app settings
   ```

2. **Push notifications not working**
   ```
   Error: Invalid VAPID keys
   Solution: Regenerate VAPID keys with web-push generate-vapid-keys
   ```

3. **Database connection failed**
   ```
   Error: Can't reach database server
   Solution: Ensure PostgreSQL is running: docker-compose up postgres
   ```

4. **Email not sending**
   ```
   Error: SMTP authentication failed
   Solution: Check email credentials and app password
   ```

### Debug Commands

```bash
# Check service status
pnpm run status

# View API logs
cd apps/api-gateway && pnpm run logs

# Check database connection
cd packages/database && pnpm run db:status

# Test email configuration
cd apps/api-gateway && pnpm run test:email

# Validate environment variables
cd apps/api-gateway && pnpm run validate:env
```

### Log Locations

- **API Gateway**: `apps/api-gateway/logs/`
- **Web Dashboard**: Browser console and Next.js logs
- **Database**: Docker logs via `docker-compose logs postgres`
- **Redis**: Docker logs via `docker-compose logs redis`

## 🎯 Next Steps

After successful setup:

1. **Configure production domain** and SSL certificates
2. **Set up monitoring** with health checks
3. **Configure backups** for database and user data
4. **Set up CI/CD pipeline** for deployments
5. **Add custom email templates** for branding
6. **Configure rate limiting** and security headers
7. **Set up log aggregation** and monitoring

## 📞 Support

If you encounter issues:

1. Check this guide and the troubleshooting section
2. Review logs for specific error messages
3. Ensure all environment variables are set correctly
4. Verify that all required services are running
5. Check the GitHub Issues for known problems

For additional help, please refer to:
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Container Architecture](CONTAINER_ARCHITECTURE.md)
- [Confirmation System](CONFIRMATION_SYSTEM.md)
- [GitHub OAuth Setup](GITHUB_OAUTH_SETUP.md)