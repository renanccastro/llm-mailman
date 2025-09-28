#!/bin/bash

# AI Dev Assistant Platform - Development Startup Script

set -e

echo "🚀 Starting AI Development Assistant Platform"
echo "=============================================="

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "📦 Installing dependencies..."
pnpm install

echo "🐳 Starting infrastructure services..."
docker-compose up -d postgres redis

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U aidev; do
    sleep 2
done

echo "📊 Setting up database..."
pnpm db:generate
pnpm db:migrate

echo "🏗️  Building packages..."
pnpm build

echo "🌟 Starting development servers..."

# Start all services in parallel
echo "Starting API Gateway on http://localhost:4000"
echo "Starting Web Dashboard on http://localhost:3001"
echo "Starting PostgreSQL on localhost:5432"
echo "Starting Redis on localhost:6379"

# Run in development mode
pnpm dev

echo "✅ All services started successfully!"
echo ""
echo "🌐 Access points:"
echo "  - Web Dashboard: http://localhost:3001"
echo "  - API Gateway:   http://localhost:4000"
echo "  - API Docs:      http://localhost:4000/api"
echo "  - Health Check:  http://localhost:4000/health"
echo ""
echo "📊 Development tools:"
echo "  - Adminer (DB):     http://localhost:8080"
echo "  - Redis Commander: http://localhost:8081 (with --profile debug)"
echo "  - MailHog:         http://localhost:8025 (with --profile development)"
echo ""
echo "🛠️  Commands:"
echo "  - Stop services:    docker-compose down"
echo "  - View logs:        docker-compose logs -f"
echo "  - Database studio:  pnpm db:studio"
echo ""