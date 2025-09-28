# Deployment Guide - AI Development Assistant Platform

This guide covers multiple deployment options for hosting the AI Development Assistant Platform, from development to production.

## 🏗️ Architecture Overview

The platform consists of:
- **Web Dashboard** (Next.js) - Port 3001
- **API Gateway** (Express.js) - Port 4000
- **PostgreSQL Database** - Port 5432
- **Redis** - Port 6379
- **Container Runtime** (Docker)

## 🚀 Deployment Options

### Option 1: Docker Compose (Recommended for Getting Started)

The simplest way to deploy everything locally or on a single server.

#### Prerequisites
- Docker & Docker Compose
- 2GB+ RAM
- 10GB+ disk space

#### Quick Start
```bash
# Clone and setup
git clone <your-repo>
cd maillm

# Copy environment files
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/web-dashboard/.env.example apps/web-dashboard/.env.local

# Edit environment files with your GitHub OAuth credentials
nano apps/api-gateway/.env
nano apps/web-dashboard/.env.local

# Build and start all services
docker-compose up -d

# Check logs
docker-compose logs -f
```

#### Docker Compose Configuration
```yaml
# docker-compose.yml (create this file)
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ai_dev_assistant
      POSTGRES_USER: ai_dev_user
      POSTGRES_PASSWORD: secure_password_123
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ai_dev_user -d ai_dev_assistant"]
      interval: 30s
      timeout: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  api-gateway:
    build:
      context: .
      dockerfile: apps/api-gateway/Dockerfile
    environment:
      - DATABASE_URL=postgresql://ai_dev_user:secure_password_123@postgres:5432/ai_dev_assistant
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    env_file:
      - apps/api-gateway/.env
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

  web-dashboard:
    build:
      context: .
      dockerfile: apps/web-dashboard/Dockerfile
    env_file:
      - apps/web-dashboard/.env.local
    ports:
      - "3001:3001"
    depends_on:
      - api-gateway
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Option 2: Cloud Deployment (DigitalOcean/Linode/AWS EC2)

Deploy on a single cloud server with automatic SSL and domain setup.

#### Server Requirements
- **Minimum**: 2 vCPUs, 4GB RAM, 20GB SSD
- **Recommended**: 4 vCPUs, 8GB RAM, 40GB SSD
- **OS**: Ubuntu 22.04 LTS

#### Setup Script
```bash
#!/bin/bash
# deploy.sh - Run this on your cloud server

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx for reverse proxy
sudo apt install nginx certbot python3-certbot-nginx -y

# Clone your repository
git clone <your-repo-url> /opt/ai-dev-assistant
cd /opt/ai-dev-assistant

# Setup environment files
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/web-dashboard/.env.example apps/web-dashboard/.env.local

# Update environment files for production
sudo nano apps/api-gateway/.env
sudo nano apps/web-dashboard/.env.local

# Start services
docker-compose up -d

# Setup Nginx reverse proxy
sudo tee /etc/nginx/sites-available/ai-dev-assistant > /dev/null <<EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/ai-dev-assistant /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Setup SSL with Let's Encrypt
sudo certbot --nginx -d your-domain.com

# Setup auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

### Option 3: Kubernetes Deployment (Production)

For high availability and scalability.

#### Prerequisites
- Kubernetes cluster (GKE, EKS, AKS, or self-managed)
- kubectl configured
- Helm 3.x

#### Kubernetes Manifests
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ai-dev-assistant

---
# k8s/postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: ai-dev-assistant
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: ai_dev_assistant
        - name: POSTGRES_USER
          value: ai_dev_user
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        ports:
        - containerPort: 5432
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi

---
# k8s/api-gateway.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: ai-dev-assistant
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: your-registry/ai-dev-assistant/api-gateway:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: REDIS_URL
          value: redis://redis:6379
        envFrom:
        - secretRef:
            name: app-secrets
        ports:
        - containerPort: 4000
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5

---
# k8s/web-dashboard.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-dashboard
  namespace: ai-dev-assistant
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-dashboard
  template:
    metadata:
      labels:
        app: web-dashboard
    spec:
      containers:
      - name: web-dashboard
        image: your-registry/ai-dev-assistant/web-dashboard:latest
        envFrom:
        - secretRef:
            name: web-secrets
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "200m"
```

#### Deploy to Kubernetes
```bash
# Create secrets
kubectl create secret generic postgres-secret \
  --from-literal=password=your-secure-password \
  -n ai-dev-assistant

kubectl create secret generic app-secrets \
  --from-literal=database-url=postgresql://user:pass@postgres:5432/ai_dev_assistant \
  --from-literal=github-client-id=your-github-client-id \
  --from-literal=github-client-secret=your-github-client-secret \
  --from-literal=jwt-secret=your-jwt-secret \
  -n ai-dev-assistant

# Apply manifests
kubectl apply -f k8s/
```

### Option 4: Platform as a Service (Heroku/Railway/Render)

Simplest deployment with managed infrastructure.

#### Railway Deployment
1. Connect your GitHub repository to Railway
2. Create services for:
   - API Gateway (Node.js app)
   - Web Dashboard (Next.js app)
   - PostgreSQL (managed database)
   - Redis (managed cache)
3. Set environment variables in Railway dashboard
4. Deploy automatically on git push

#### Heroku Deployment
```bash
# Install Heroku CLI
# Create apps
heroku create your-app-api --region us
heroku create your-app-web --region us

# Add PostgreSQL and Redis
heroku addons:create heroku-postgresql:mini --app your-app-api
heroku addons:create heroku-redis:mini --app your-app-api

# Set environment variables
heroku config:set GITHUB_CLIENT_ID=your-id --app your-app-api
heroku config:set GITHUB_CLIENT_SECRET=your-secret --app your-app-api

# Deploy
git subtree push --prefix apps/api-gateway heroku-api main
git subtree push --prefix apps/web-dashboard heroku-web main
```

## 🔧 Required Environment Variables

### Production Environment Setup

#### API Gateway (.env)
```bash
# Server
NODE_ENV=production
PORT=4000

# Database (use managed database URLs in production)
DATABASE_URL=postgresql://user:pass@your-db-host:5432/ai_dev_assistant

# Redis (use managed Redis URLs in production)
REDIS_URL=redis://user:pass@your-redis-host:6379

# GitHub OAuth (from GitHub App settings)
GITHUB_CLIENT_ID=your-production-github-client-id
GITHUB_CLIENT_SECRET=your-production-github-client-secret

# JWT (generate secure 32+ character secrets)
JWT_SECRET=your-super-secure-jwt-secret-at-least-32-characters

# Email (choose one)
SENDGRID_API_KEY=your-sendgrid-api-key
# OR
SMTP_HOST=smtp.your-provider.com
SMTP_USER=your-email@domain.com
SMTP_PASS=your-app-password
```

#### Web Dashboard (.env.local)
```bash
# GitHub OAuth
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-production-github-client-id

# API URL (your production API endpoint)
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com/api/v1
```

## 📧 Email Configuration

### Option 1: SendGrid (Recommended)
1. Create SendGrid account
2. Get API key
3. Set `SENDGRID_API_KEY` environment variable

### Option 2: Gmail SMTP
1. Enable 2FA on Gmail
2. Generate App Password
3. Use Gmail SMTP settings

### Option 3: Custom Email Provider
Configure SMTP settings for your email provider.

## 🌐 Domain & DNS Setup

1. **Purchase domain** (e.g., yourapp.com)
2. **Create DNS records**:
   ```
   A     @           your-server-ip
   A     api         your-server-ip
   CNAME www         yourapp.com
   MX    @           your-email-provider
   ```
3. **Update GitHub OAuth** callback URLs to production domain
4. **Update environment variables** with production URLs

## 🔒 Security Checklist

- [ ] Use strong, unique passwords for all services
- [ ] Enable HTTPS with valid SSL certificates
- [ ] Set secure JWT secrets (32+ characters)
- [ ] Configure firewall rules (only allow necessary ports)
- [ ] Enable database encryption at rest
- [ ] Set up regular backups
- [ ] Configure monitoring and logging
- [ ] Use secrets management (not plain text env vars)
- [ ] Enable rate limiting
- [ ] Set up container security scanning

## 📊 Monitoring & Maintenance

### Health Checks
Add health check endpoints:
```javascript
// API Gateway health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});
```

### Monitoring Tools
- **Uptime**: UptimeRobot, Pingdom
- **Logs**: Datadog, LogRocket, Sentry
- **Performance**: New Relic, AppSignal
- **Infrastructure**: Grafana + Prometheus

### Backup Strategy
```bash
# Database backup script
#!/bin/bash
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz
# Upload to S3/Google Cloud Storage
```

## 💰 Cost Estimates

### Small Deployment (1-100 users)
- **DigitalOcean Droplet**: $20/month (4GB RAM)
- **Managed PostgreSQL**: $15/month
- **Domain**: $12/year
- **SSL**: Free (Let's Encrypt)
- **Total**: ~$35/month

### Medium Deployment (100-1000 users)
- **AWS/GCP**: $50-100/month
- **Managed Database**: $30-50/month
- **CDN**: $10/month
- **Monitoring**: $20/month
- **Total**: ~$110-180/month

### Enterprise Deployment (1000+ users)
- **Kubernetes Cluster**: $200-500/month
- **Load Balancers**: $50/month
- **Database Cluster**: $100-300/month
- **Monitoring/Logging**: $50-100/month
- **Total**: $400-950/month

## 🚀 Quick Start Commands

```bash
# Local development
pnpm install
pnpm run dev

# Docker deployment
docker-compose up -d

# Cloud deployment
./deploy.sh

# Kubernetes deployment
kubectl apply -f k8s/
```

Choose the deployment option that best fits your needs, budget, and technical requirements!