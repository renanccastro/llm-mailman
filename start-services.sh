#!/bin/bash

# Script to start all required services for testing
set -e

echo "=== Starting AI Dev Assistant Services ==="

# Check if running with docker permissions
if ! docker ps &> /dev/null; then
    echo "ERROR: Docker permission denied. Trying with sudo..."
    USE_SUDO="sudo"
else
    USE_SUDO=""
fi

# Start PostgreSQL and Redis
echo "Starting PostgreSQL and Redis..."
$USE_SUDO docker compose up -d postgres redis

# Wait for services to be healthy
echo "Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'until docker exec aidev-postgres pg_isready -U aidev 2>/dev/null; do sleep 1; done' || echo "Timeout waiting for PostgreSQL"

echo "Waiting for Redis to be ready..."
timeout 60 bash -c 'until docker exec aidev-redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done' || echo "Timeout waiting for Redis"

echo "=== Services started successfully ==="
